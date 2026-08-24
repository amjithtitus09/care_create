import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { execa, type ResultPromise } from "execa";
import type { Command } from "commander";

import type { CreateManifest } from "../types.js";

const COMPOSE_FILES = ["-f", "docker-compose.yaml", "-f", "docker-compose.local.yaml"];

const PREFIX_COLORS = [pc.cyan, pc.green, pc.magenta, pc.yellow, pc.blue, pc.red];

interface Task {
  name: string;
  cwd: string;
  command: string;
  env?: Record<string, string>;
}

export function registerRunCommand(program: Command): void {
  program
    .command("run [directory]")
    .alias("start")
    .description("Install missing deps and start the backend, frontend, and frontend plug dev servers")
    .action((directory: string | undefined) => runCommand(directory));
}

async function readManifest(targetPath: string): Promise<CreateManifest> {
  const file = path.join(targetPath, ".care-create.json");
  if (!existsSync(file)) {
    throw new Error(`No .care-create.json found in ${targetPath}. Run 'care create' first.`);
  }
  return JSON.parse(await fs.readFile(file, "utf8")) as CreateManifest;
}

async function ensureDeps(cwd: string): Promise<void> {
  if (!existsSync(path.join(cwd, "node_modules"))) {
    await execa("npm", ["install"], { cwd, stdio: "inherit" });
  }
}

function parseCommand(command: string): [string, string[]] {
  const parts = command.trim().split(/\s+/);
  return [parts[0], parts.slice(1)];
}

// Stream a child's output with a colored [name] prefix so concurrent servers stay readable.
function spawnTask(task: Task, color: (text: string) => string): ResultPromise {
  const [command, args] = parseCommand(task.command);
  const child = execa(command, args, {
    cwd: task.cwd,
    env: { ...process.env, FORCE_COLOR: "1", ...task.env },
    stdout: "pipe",
    stderr: "pipe",
    reject: false,
  });

  const prefix = color(`[${task.name}]`);
  const pipe = (stream: NodeJS.ReadableStream): void => {
    let buffer = "";
    stream.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        process.stdout.write(`${prefix} ${line}\n`);
      }
    });
  };

  if (child.stdout) pipe(child.stdout);
  if (child.stderr) pipe(child.stderr);
  return child;
}

async function runCommand(directory: string | undefined): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" @ohcn/care run ")));

  const targetPath = path.resolve(process.cwd(), directory ?? ".");

  let manifest: CreateManifest;
  try {
    manifest = await readManifest(targetPath);
  } catch (error) {
    p.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const tasks: Task[] = [];

  const backendPath = path.join(targetPath, manifest.backendDir);
  if (manifest.runtime === "docker") {
    p.log.step("Starting backend services (docker, detached)");
    await execa("docker", ["compose", ...COMPOSE_FILES, "up", "-d"], { cwd: backendPath, stdio: "inherit" });
  } else {
    tasks.push({
      name: "backend",
      cwd: backendPath,
      command: "pipenv run python manage.py runserver 0.0.0.0:9000",
      env: { DJANGO_SETTINGS_MODULE: "config.settings.local", DJANGO_READ_DOT_ENV_FILE: "true" },
    });
  }

  const frontendPath = path.join(targetPath, manifest.frontendDir);
  if (existsSync(frontendPath)) {
    p.log.step("Preparing frontend (care_fe)");
    await ensureDeps(frontendPath);
    tasks.push({ name: "care_fe", cwd: frontendPath, command: "npm run dev" });
  }

  for (const plug of manifest.frontendPlugs) {
    const plugPath = path.join(targetPath, plug.dir);
    if (!existsSync(plugPath)) {
      p.log.warn(`Skipping ${plug.name}: ${plug.dir} not found`);
      continue;
    }
    p.log.step(`Preparing frontend plug ${plug.name}${plug.devUrl ? ` (${plug.devUrl})` : ""}`);
    await ensureDeps(plugPath);
    tasks.push({ name: plug.name, cwd: plugPath, command: plug.devCommand ?? "npm run dev" });
  }

  if (tasks.length === 0) {
    p.outro("Nothing to run.");
    return;
  }

  const children = tasks.map((task, index) => spawnTask(task, PREFIX_COLORS[index % PREFIX_COLORS.length]));

  const shutdown = (): void => {
    for (const child of children) {
      child.kill("SIGINT");
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  p.log.info("Dev servers running. Press Ctrl+C to stop.");
  await Promise.allSettled(children);
}
