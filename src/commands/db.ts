import * as p from "@clack/prompts";
import pc from "picocolors";
import path from "node:path";
import type { Command } from "commander";

import { readManifest, runManage } from "../lib/backend.js";

interface ClearOptions {
  hard?: boolean;
}

function message(error: unknown): string {
  if (error instanceof Error) {
    return (error as { shortMessage?: string }).shortMessage ?? error.message;
  }
  return String(error);
}

export function registerDbCommand(program: Command): void {
  const db = program.command("db").description("Manage the CARE database for an existing setup");

  db.command("populate [directory]")
    .alias("seed")
    .description("Load dummy fixture data into the database")
    .action((directory: string | undefined) => populateCommand(directory));

  db.command("clear [directory]")
    .alias("reset")
    .description("Remove all data from the database")
    .option("--hard", "drop and recreate the database instead of flushing rows")
    .action((directory: string | undefined, options: ClearOptions) => clearCommand(directory, options));
}

async function resolveRuntime(directory: string | undefined) {
  const targetPath = path.resolve(process.cwd(), directory ?? ".");
  const manifest = await readManifest(targetPath);
  const backendPath = path.join(targetPath, manifest.backendDir);
  return { runtime: manifest.runtime, backendPath };
}

async function populateCommand(directory: string | undefined): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" @ohcn/care db populate ")));

  try {
    const { runtime, backendPath } = await resolveRuntime(directory);
    p.log.step(`Loading fixtures (${runtime})`);
    await runManage(runtime, backendPath, ["load_fixtures"]);
    p.outro(pc.green("Database populated with dummy data."));
  } catch (error) {
    p.log.error(message(error));
    process.exit(1);
  }
}

async function clearCommand(directory: string | undefined, options: ClearOptions): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" @ohcn/care db clear ")));

  try {
    const { runtime, backendPath } = await resolveRuntime(directory);

    if (options.hard) {
      p.log.step(`Dropping and recreating the database (${runtime})`);
      await runManage(runtime, backendPath, ["reset_db", "--noinput"]);
      p.log.step("Applying migrations");
      await runManage(runtime, backendPath, ["migrate"]);
    } else {
      p.log.step(`Flushing all data (${runtime})`);
      await runManage(runtime, backendPath, ["flush", "--no-input"]);
    }

    p.log.step("Syncing permissions and valuesets");
    await runManage(runtime, backendPath, ["sync_permissions_roles"]);
    await runManage(runtime, backendPath, ["sync_valueset"]);

    p.outro(pc.green("Database cleared."));
  } catch (error) {
    p.log.error(message(error));
    process.exit(1);
  }
}
