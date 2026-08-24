import { execa } from "execa";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

export async function cloneRepo(repo: string, branch: string, dest: string): Promise<void> {
  if (existsSync(dest) && (await fs.readdir(dest)).length > 0) {
    throw new Error(`Destination ${dest} already exists and is not empty`);
  }

  const args = ["clone", "--depth", "1"];
  if (branch) {
    args.push("--branch", branch);
  }
  args.push(repo, dest);

  await execa("git", args);
}
