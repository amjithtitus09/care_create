import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Quote only when the value contains whitespace; JSON values (e.g. ADDITIONAL_PLUGS) must stay unquoted for docker env_file.
function formatValue(value: unknown): string {
  const stringValue = String(value ?? "");
  return /\s/.test(stringValue) ? `"${stringValue.replace(/"/g, '\\"')}"` : stringValue;
}

// Insert or replace KEY=VALUE lines in an env file, preserving existing content.
export async function upsertEnv(filePath: string, values: Record<string, string>): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const content = existsSync(filePath) ? await fs.readFile(filePath, "utf8") : "";
  const lines = content.length ? content.split("\n") : [];

  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${formatValue(value)}`;
    const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
    const index = lines.findIndex((existing) => pattern.test(existing));
    if (index >= 0) {
      lines[index] = line;
    } else {
      lines.push(line);
    }
  }

  await fs.writeFile(filePath, `${lines.join("\n").replace(/\n+$/, "")}\n`);
}

export async function copyIfMissing(src: string, dest: string): Promise<void> {
  if (existsSync(dest) || !existsSync(src)) {
    return;
  }
  await fs.copyFile(src, dest);
}
