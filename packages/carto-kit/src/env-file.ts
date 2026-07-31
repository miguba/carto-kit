import { chmod, readFile, writeFile } from "node:fs/promises";

export type EnvUpdates = Record<"PUBLIC_COMMERCE_API_BASE_URL" | "COMMERCE_API_TOKEN", string>;

export function mergeEnv(contents: string, updates: EnvUpdates, overwrite: ReadonlySet<string> = new Set()): { contents: string; conflicts: string[] } {
  const lines = contents ? contents.replace(/\r\n/g, "\n").split("\n") : [];
  if (lines.at(-1) === "") lines.pop();
  const found = new Set<string>();
  const conflicts: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(PUBLIC_COMMERCE_API_BASE_URL|COMMERCE_API_TOKEN)\s*=/);
    if (!match) continue;
    const key = match[1] as keyof EnvUpdates;
    found.add(key);
    const current = lines[index].slice(lines[index].indexOf("=") + 1).trim();
    if (current && current !== updates[key] && !overwrite.has(key)) conflicts.push(key);
    else lines[index] = `${key}=${formatEnvValue(updates[key])}`;
  }
  for (const key of Object.keys(updates) as Array<keyof EnvUpdates>) {
    if (!found.has(key)) lines.push(`${key}=${formatEnvValue(updates[key])}`);
  }
  return { contents: `${lines.join("\n")}\n`, conflicts };
}

export async function readOptional(path: string): Promise<string> {
  try { return await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw error; }
}

export async function writeEnv(path: string, contents: string): Promise<void> {
  await writeFile(path, contents, { mode: 0o600 });
  await chmod(path, 0o600);
}

export function gitignoreCoversEnv(contents: string): boolean {
  return contents.split(/\r?\n/).some((line) => [".env", ".env*"].includes(line.trim()));
}

export function addEnvToGitignore(contents: string): string {
  const base = contents && !contents.endsWith("\n") ? `${contents}\n` : contents;
  return `${base}.env\n`;
}

function formatEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}
