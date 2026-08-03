import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SECRET_PATH = ".carto/secrets.json";

interface SecretFile {
  schemaVersion: 1;
  cartoPrivate?: { token: string; connectedAt: string };
}

export async function hasPrivateToken(projectDir: string): Promise<boolean> {
  return Boolean((await readSecrets(projectDir)).cartoPrivate?.token);
}

export async function readPrivateToken(projectDir: string): Promise<string | undefined> {
  return (await readSecrets(projectDir)).cartoPrivate?.token;
}

export async function savePrivateToken(projectDir: string, token: string): Promise<void> {
  const path = resolve(projectDir, SECRET_PATH);
  const value: SecretFile = {
    ...(await readSecrets(projectDir)),
    schemaVersion: 1,
    cartoPrivate: { token, connectedAt: new Date().toISOString() }
  };
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
  await ensureGitIgnored(projectDir);
}

async function readSecrets(projectDir: string): Promise<SecretFile> {
  try {
    const parsed = JSON.parse(await readFile(resolve(projectDir, SECRET_PATH), "utf8")) as SecretFile;
    return parsed.schemaVersion === 1 ? parsed : { schemaVersion: 1 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1 };
    throw error;
  }
}

async function ensureGitIgnored(projectDir: string): Promise<void> {
  const path = resolve(projectDir, ".gitignore");
  let current = "";
  try { current = await readFile(path, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (current.split(/\r?\n/).includes(SECRET_PATH)) return;
  await writeFile(path, `${current}${current && !current.endsWith("\n") ? "\n" : ""}${SECRET_PATH}\n`);
}
