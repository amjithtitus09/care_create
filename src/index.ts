import { Command } from "commander";
import { createRequire } from "node:module";

import { registerCreateCommand } from "./commands/create.js";
import { registerRunCommand } from "./commands/run.js";
import { registerDbCommand } from "./commands/db.js";
import { registerStopCommand } from "./commands/stop.js";
import { registerSyncCommand } from "./commands/sync.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export function run(argv: string[]): void {
  const program = new Command();

  program
    .name("care")
    .description("Bootstrap and manage a local CARE development environment")
    .version(pkg.version);

  registerCreateCommand(program);
  registerRunCommand(program);
  registerDbCommand(program);
  registerStopCommand(program);
  registerSyncCommand(program);

  program.parseAsync(argv);
}
