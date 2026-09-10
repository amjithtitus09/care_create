import { execa } from "execa";
import { existsSync } from "node:fs";
import path from "node:path";

export async function cloneRepo(repo: string, branch: string, dest: string): Promise<boolean> {
  if (existsSync(dest) && existsSync(path.join(dest, ".git"))) {
    return false;
  }

  const args = ["clone", "--depth", "1"];
  if (branch) {
    args.push("--branch", branch);
  }
  args.push(repo, dest);

  await execa("git", args);
  return true;
}

export async function pullRepo(dir: string): Promise<void> {
  if (!existsSync(path.join(dir, ".git"))) {
    throw new Error(`${dir} is not a git repository`);
  }
  await execa("git", ["pull", "--ff-only"], { cwd: dir });
}
