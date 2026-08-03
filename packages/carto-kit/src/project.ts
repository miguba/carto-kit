import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface FrontsiteProject {
  root: string;
  packageName: string;
  envPath: string;
  gitignorePath: string;
  packageJson: Record<string, unknown>;
}

export async function inspectFrontsiteProject(directory: string): Promise<FrontsiteProject> {
  const root = resolve(directory);
  const packagePath = resolve(root, "package.json");
  let pkg: Record<string, unknown> & { name?: unknown };
  try { pkg = JSON.parse(await readFile(packagePath, "utf8")); }
  catch { throw new Error(`Not a Frontsite project: could not read ${packagePath}.`); }
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) {
    throw new Error(`Not a Frontsite project: ${packagePath} must contain a JSON object.`);
  }
  const config = await readOptional(resolve(root, "carto.config.json"));
  const explicitlyConfigured = config !== undefined;
  if (config !== undefined) {
    try {
      const parsed = JSON.parse(config) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("configuration must be a JSON object");
    } catch (error) {
      throw new Error(`Not a Frontsite project: invalid carto.config.json (${error instanceof Error ? error.message : String(error)}).`);
    }
  }
  const commerce = await readOptional(resolve(root, "src/lib/commerce.ts"));
  const configuration = (await Promise.all([
    readOptional(resolve(root, "src/lib/config.ts")),
    readOptional(resolve(root, "src/env.d.ts")),
    readOptional(resolve(root, ".env.example"))
  ])).filter((value): value is string => value !== undefined).join("\n");
  const legacyCartoMarkers = Boolean(
    commerce?.includes("COMMERCE_API_TOKEN") &&
    commerce.includes("/api/commerce/") &&
    configuration.includes("PUBLIC_COMMERCE_API_BASE_URL")
  );
  if (!explicitlyConfigured && !legacyCartoMarkers) {
    throw new Error("Not a Carto Frontsite project: expected carto.config.json or legacy Carto commerce markers.");
  }
  return {
    root,
    packageName: typeof pkg.name === "string" && pkg.name.trim() ? pkg.name : "frontsite",
    envPath: resolve(root, ".env"),
    gitignorePath: resolve(root, ".gitignore"),
    packageJson: pkg
  };
}

async function readOptional(path: string): Promise<string | undefined> {
  try { return await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
