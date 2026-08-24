import { Command } from "commander";
import { createRequire } from "node:module";

import { registerCreateCommand } from "./commands/create.js";
import { registerRunCommand } from "./commands/run.js";

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

  program.parseAsync(argv);
}
