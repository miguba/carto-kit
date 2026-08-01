import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface FrontsiteProject { root: string; packageName: string; envPath: string; gitignorePath: string }

export async function inspectFrontsiteProject(directory: string): Promise<FrontsiteProject> {
  const root = resolve(directory);
  const packagePath = resolve(root, "package.json");
  let pkg: { name?: unknown; scripts?: Record<string, unknown>; dependencies?: Record<string, unknown> };
  try { pkg = JSON.parse(await readFile(packagePath, "utf8")); }
  catch { throw new Error(`Not a Frontsite project: could not read ${packagePath}.`); }
  const required = ["astro.config.mjs", "src/lib/commerce.ts"];
  try { await Promise.all(required.map((file) => access(resolve(root, file)))); }
  catch { throw new Error("Not a Carto Frontsite project: expected Astro and Carto commerce files were not found."); }
  if (!pkg.dependencies?.astro || typeof pkg.scripts?.dev !== "string") {
    throw new Error("Not a Carto Frontsite project: package.json does not contain the expected Astro setup.");
  }
  const commerce = await readFile(resolve(root, "src/lib/commerce.ts"), "utf8");
  const configurationMarkers = await Promise.all([
    readOptional(resolve(root, "src/lib/config.ts")),
    readOptional(resolve(root, "src/env.d.ts")),
    readOptional(resolve(root, ".env.example"))
  ]);
  const configuration = configurationMarkers.join("\n");
  if (
    !commerce.includes("COMMERCE_API_TOKEN") ||
    !commerce.includes("/api/commerce/") ||
    !configuration.includes("PUBLIC_COMMERCE_API_BASE_URL")
  ) {
    throw new Error("Not a Carto Frontsite project: Commerce API configuration marker is missing.");
  }
  return { root, packageName: typeof pkg.name === "string" ? pkg.name : "frontsite", envPath: resolve(root, ".env"), gitignorePath: resolve(root, ".gitignore") };
}

async function readOptional(path: string): Promise<string> {
  try { return await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw error; }
}
