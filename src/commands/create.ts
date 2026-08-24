import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import type { Command } from "commander";

import registryJson from "../plugs.json" with { type: "json" };
import type { BackendPlug, CreateManifest, FrontendPlug, PluginConfigEntry, Registry, Runtime } from "../types.js";
import { cloneRepo } from "../lib/git.js";
import { upsertEnv, copyIfMissing } from "../lib/env.js";
import { orchestrate } from "../lib/orchestrate.js";

const registry = registryJson as unknown as Registry;

const CANCELLED = Symbol("cancelled");

// Base backend env for the native runtime, where services run on localhost instead of docker hosts.
const NATIVE_BASE_ENV: Record<string, string> = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/care",
  REDIS_URL: "redis://localhost:6379",
  CELERY_BROKER_URL: "redis://localhost:6379/0",
};

interface CreateOptions {
  branch?: string;
  skipInstall?: boolean;
}

export function registerCreateCommand(program: Command): void {
  program
    .command("create [directory]")
    .description("Clone and bootstrap a full local CARE setup")
    .option("--branch <branch>", "override the branch used for the core care and care_fe repos")
    .option("--skip-install", "clone and configure only; skip building and starting services")
    .action((directory: string | undefined, options: CreateOptions) => createCommand(directory, options));
}

function cancel(): never {
  p.cancel("Setup aborted.");
  process.exit(0);
}

function message(error: unknown): string {
  if (error instanceof Error) {
    return (error as { shortMessage?: string }).shortMessage ?? error.message;
  }
  return String(error);
}

// Resolve each plug's env vars (prompting the flagged ones) into a per-plug map.
async function collectEnvPerPlug(
  plugs: (BackendPlug | FrontendPlug)[],
): Promise<Map<string, Record<string, string>> | symbol> {
  const result = new Map<string, Record<string, string>>();

  for (const plug of plugs) {
    const resolved: Record<string, string> = {};
    for (const variable of plug.env ?? []) {
      if (!variable.prompt) {
        resolved[variable.key] = variable.default ?? "";
        continue;
      }

      const label = `${pc.dim(`[${plug.name}]`)} ${variable.key}${
        variable.description ? pc.dim(` — ${variable.description}`) : ""
      }`;

      const answer = variable.secret
        ? await p.password({ message: label })
        : await p.text({
            message: label,
            defaultValue: variable.default ?? "",
            placeholder: variable.default ?? "",
          });

      if (p.isCancel(answer)) {
        return CANCELLED;
      }
      resolved[variable.key] = (answer as string) || variable.default || "";
    }
    result.set(plug.name, resolved);
  }

  return result;
}

async function cloneCore(
  spinner: ReturnType<typeof p.spinner>,
  repo: string,
  branch: string,
  dest: string,
  label: string,
): Promise<void> {
  spinner.start(`Cloning ${label}`);
  await cloneRepo(repo, branch, dest);
  spinner.stop(`Cloned ${label}`);
}

// Backend plugs load editable from inside the mounted /app volume, so edits live-reload.
function backendPlugPackage(plug: BackendPlug, runtime: Runtime, backendPath: string): string {
  return runtime === "docker" ? plug.packageName : path.join(backendPath, plug.dir);
}

async function createCommand(directory: string | undefined, options: CreateOptions): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" @ohcn/care create ")));

  const targetInput =
    directory ??
    (await p.text({
      message: "Where should the setup live?",
      placeholder: "./care-platform",
      defaultValue: "./care-platform",
    }));
  if (p.isCancel(targetInput)) return cancel();

  const targetPath = path.resolve(process.cwd(), targetInput);
  if (existsSync(targetPath) && (await fs.readdir(targetPath)).length > 0) {
    const proceed = await p.confirm({
      message: `${targetInput} already exists and is not empty. Continue anyway?`,
      initialValue: false,
    });
    if (p.isCancel(proceed) || !proceed) return cancel();
  }

  const runtime = await p.select({
    message: "How do you want to run the backend services?",
    options: [
      { value: "docker", label: "Docker Compose", hint: "Postgres, Redis, MinIO, backend & celery" },
      { value: "native", label: "Native", hint: "pipenv + local Postgres/Redis" },
    ],
    initialValue: "docker",
  });
  if (p.isCancel(runtime)) return cancel();

  const backendSelection = await p.multiselect({
    message: "Select backend plugs to install",
    options: registry.backend.map((plug) => ({ value: plug.name, label: plug.name, hint: plug.description })),
    required: false,
  });
  if (p.isCancel(backendSelection)) return cancel();

  const frontendSelection = await p.multiselect({
    message: "Select frontend plugs to install",
    options: registry.frontend.map((plug) => ({ value: plug.name, label: plug.name, hint: plug.description })),
    required: false,
  });
  if (p.isCancel(frontendSelection)) return cancel();

  const selectedBackend = registry.backend.filter((plug) => backendSelection.includes(plug.name));
  const selectedFrontend = registry.frontend.filter((plug) => frontendSelection.includes(plug.name));

  const backendEnvByPlug = await collectEnvPerPlug(selectedBackend);
  if (typeof backendEnvByPlug === "symbol") return cancel();
  const frontendEnvByPlug = await collectEnvPerPlug(selectedFrontend);
  if (typeof frontendEnvByPlug === "symbol") return cancel();

  const seedData = await p.confirm({
    message: "Populate the database with dummy data?",
    initialValue: true,
  });
  if (p.isCancel(seedData)) return cancel();

  const core = registry.core;
  const backendPath = path.join(targetPath, core.backend.dir);
  const frontendPath = path.join(targetPath, core.frontend.dir);
  const warnings: string[] = [];

  const spinner = p.spinner();

  try {
    await cloneCore(spinner, core.backend.repo, options.branch ?? core.backend.branch, backendPath, "care backend");
    await cloneCore(spinner, core.frontend.repo, options.branch ?? core.frontend.branch, frontendPath, "care frontend");
  } catch (error) {
    spinner.stop("Failed to clone core repositories");
    p.log.error(message(error));
    process.exit(1);
  }

  const installedBackend: BackendPlug[] = [];
  for (const plug of selectedBackend) {
    try {
      spinner.start(`Cloning backend plug ${plug.name}`);
      await cloneRepo(plug.repo, plug.branch, path.join(backendPath, plug.dir));
      spinner.stop(`Cloned backend plug ${plug.name}`);
      installedBackend.push(plug);
    } catch (error) {
      spinner.stop(`Skipped backend plug ${plug.name}`);
      warnings.push(`Skipped backend plug ${plug.name}: ${message(error)}`);
    }
  }

  const installedFrontend: FrontendPlug[] = [];
  for (const plug of selectedFrontend) {
    try {
      spinner.start(`Cloning frontend plug ${plug.name}`);
      await cloneRepo(plug.repo, plug.branch, path.join(targetPath, plug.dir));
      spinner.stop(`Cloned frontend plug ${plug.name}`);
      installedFrontend.push(plug);
    } catch (error) {
      spinner.stop(`Skipped frontend plug ${plug.name}`);
      warnings.push(`Skipped frontend plug ${plug.name}: ${message(error)}`);
    }
  }

  // Backend plug env travels inside each plug's configs (surfaced via PLUGIN_CONFIGS), not the env file.
  const additionalPlugs = installedBackend.length
    ? JSON.stringify(
        installedBackend.map((plug) => ({
          name: plug.name,
          package_name: backendPlugPackage(plug, runtime as Runtime, backendPath),
          version: plug.version ?? "",
          configs: backendEnvByPlug.get(plug.name) ?? {},
        })),
      )
    : "";

  const pluginConfigs: PluginConfigEntry[] = installedFrontend.map((plug) => ({
    slug: plug.name,
    meta: {
      url: plug.remoteEntryUrl ?? (plug.devUrl ? `http://${plug.devUrl}/assets/remoteEntry.js` : ""),
      name: plug.name,
      config: plug.pluginConfig?.config ?? {},
    },
  }));

  const plugPackages = installedBackend.map((plug) =>
    backendPlugPackage(plug, runtime as Runtime, backendPath),
  );

  try {
    spinner.start("Writing configuration");

    const backendValues: Record<string, string> = {
      DJANGO_DEBUG: seedData ? "true" : "false",
      ...(additionalPlugs ? { ADDITIONAL_PLUGS: additionalPlugs } : {}),
    };

    if (runtime === "docker") {
      await upsertEnv(path.join(backendPath, "docker", ".local.env"), backendValues);
    } else {
      const nativeEnvPath = path.join(backendPath, ".env");
      await copyIfMissing(path.join(backendPath, ".env.example"), nativeEnvPath);
      await upsertEnv(nativeEnvPath, { ...NATIVE_BASE_ENV, ...backendValues });
    }

    const frontendEnv: Record<string, string> = {};
    for (const plug of installedFrontend) {
      Object.assign(frontendEnv, frontendEnvByPlug.get(plug.name) ?? {});
    }
    const enabledApps = installedFrontend
      .map((plug) => (plug.devUrl ? `${plug.enabledApp}@${plug.devUrl}` : plug.enabledApp))
      .join(",");
    const frontendEnvPath = path.join(frontendPath, ".env.local");
    await copyIfMissing(path.join(frontendPath, ".example.env"), frontendEnvPath);
    await upsertEnv(frontendEnvPath, {
      REACT_CARE_API_URL: "http://127.0.0.1:9000",
      REACT_ENABLED_APPS: enabledApps,
      ...frontendEnv,
    });

    const manifest: CreateManifest = {
      runtime: runtime as Runtime,
      backendDir: core.backend.dir,
      frontendDir: core.frontend.dir,
      backendPlugs: installedBackend.map((plug) => ({ name: plug.name, dir: plug.dir })),
      frontendPlugs: installedFrontend.map((plug) => ({
        name: plug.name,
        dir: plug.dir,
        devUrl: plug.devUrl,
        devCommand: plug.devCommand,
      })),
    };
    await fs.writeFile(path.join(targetPath, ".care-create.json"), `${JSON.stringify(manifest, null, 2)}\n`);

    spinner.stop("Configuration written");
  } catch (error) {
    spinner.stop("Failed to write configuration");
    p.log.error(message(error));
    process.exit(1);
  }

  if (options.skipInstall) {
    reportWarnings(warnings);
    p.outro(`Files ready in ${pc.cyan(targetInput)}. Skipped build/start (--skip-install).`);
    return;
  }

  try {
    const orchestrateWarnings = await orchestrate({
      runtime: runtime as Runtime,
      backendPath,
      frontendPath,
      seedData,
      additionalPlugs,
      plugPackages,
      pluginConfigs,
    });
    warnings.push(...orchestrateWarnings);
  } catch (error) {
    p.log.error(message(error));
    reportWarnings(warnings);
    process.exit(1);
  }

  reportWarnings(warnings);
  p.note(
    [
      `${pc.bold("Start dev servers")}  cd ${path.relative(process.cwd(), targetPath) || "."} && care run`,
      `${pc.bold("Backend")}           http://localhost:9000`,
      `${pc.bold("Frontend")}          http://localhost:4000`,
      `${pc.bold("MinIO")}             http://localhost:9001`,
    ].join("\n"),
    "Your CARE setup is ready",
  );
  p.outro(pc.green("Done."));
}

function reportWarnings(warnings: string[]): void {
  if (warnings.length === 0) {
    return;
  }
  p.log.warn(`Completed with ${warnings.length} warning(s):`);
  for (const warning of warnings) {
    p.log.warn(`  • ${warning}`);
  }
}
