import { access, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ASTRO_FRAMEWORK = "astro" as const;

export interface CommandRunner {
  (root: string, executable: string, args: string[], env: NodeJS.ProcessEnv, stdin?: string, displayName?: string): Promise<void>;
}

export interface AstroBuildPreparation {
  framework: typeof ASTRO_FRAMEWORK;
  entrypointPath: string;
  outputDirectory: string;
  builtWranglerConfigPath: string;
  build(): Promise<void>;
}

export interface PrepareOptions {
  root: string;
  tempDir: string;
  wranglerConfigPath: string;
  env: NodeJS.ProcessEnv;
  npmPath: string;
  runCommand: CommandRunner;
  adapterPath?: string;
  entrypointPath?: string;
}

export async function isAstroProject(root: string, packageJson: Record<string, unknown>): Promise<boolean> {
  const dependencies = packageJson.dependencies as Record<string, unknown> | undefined;
  const devDependencies = packageJson.devDependencies as Record<string, unknown> | undefined;
  if (!dependencies?.astro && !devDependencies?.astro) return false;
  try { await access(resolve(root, "astro.config.mjs")); return true; }
  catch { return false; }
}

export async function prepareAstroCloudflareBuild(options: PrepareOptions): Promise<AstroBuildPreparation> {
  const { root, tempDir, wranglerConfigPath, env, npmPath, runCommand } = options;
  let adapterPath = options.adapterPath;
  let entrypointPath = options.entrypointPath;
  if (!adapterPath || !entrypointPath) {
    const astroVersion = await readInstalledPackageVersion(root, "astro");
    if (!astroVersion) throw new Error("Missing astro. Install the Frontsite project dependencies first.");
    const astroMajor = Number.parseInt(astroVersion.split(".")[0], 10);
    const compatibleAdapter = astroMajor === 6 ? { major: 13, version: "^13.7.0" }
      : astroMajor === 7 ? { major: 14, version: "^14.1.7" }
      : undefined;
    if (!compatibleAdapter) throw new Error(`Unsupported Astro version ${astroVersion}. The Astro adapter supports Astro 6 and 7.`);
    let adapterVersion = await readInstalledPackageVersion(root, "@astrojs/cloudflare", false);
    if (!adapterVersion || Number.parseInt(adapterVersion.split(".")[0], 10) !== compatibleAdapter.major) {
      console.log(`Preparing @astrojs/cloudflare for Astro ${astroMajor}...`);
      await runCommand(root, npmPath, ["install", "--save-dev", "--include=dev", "--no-audit", "--no-fund", `@astrojs/cloudflare@${compatibleAdapter.version}`], env, undefined, "npm");
      adapterVersion = await readInstalledPackageVersion(root, "@astrojs/cloudflare", false);
      if (!adapterVersion) {
        await runCommand(root, npmPath, ["install", "--include=dev", "--no-audit", "--no-fund"], env, undefined, "npm");
        adapterVersion = await readInstalledPackageVersion(root, "@astrojs/cloudflare", false);
      }
    }
    if (!adapterVersion || Number.parseInt(adapterVersion.split(".")[0], 10) !== compatibleAdapter.major) {
      throw new Error(`Unable to prepare a Cloudflare adapter compatible with Astro ${astroVersion}.`);
    }
    const projectRequire = createRequire(resolve(root, "package.json"));
    adapterPath = projectRequire.resolve("@astrojs/cloudflare");
    entrypointPath = projectRequire.resolve("@astrojs/cloudflare/entrypoints/server");
  }

  const astroConfigPath = resolve(tempDir, "astro.config.mjs");
  const originalConfigUrl = pathToFileURL(resolve(root, "astro.config.mjs")).href;
  const adapterUrl = pathToFileURL(adapterPath).href;
  await writeFile(astroConfigPath, [
    `import cloudflare from ${JSON.stringify(adapterUrl)};`,
    `import originalConfig from ${JSON.stringify(originalConfigUrl)};`,
    "const base = typeof originalConfig === 'function'",
    "  ? await originalConfig({ command: 'build', mode: 'production' })",
    "  : await originalConfig;",
    "export default {",
    "  ...base,",
    `  root: ${JSON.stringify(root)},`,
    "  output: 'server',",
    `  adapter: cloudflare({ configPath: ${JSON.stringify(wranglerConfigPath)}, imageService: 'passthrough', prerenderEnvironment: 'node' }),`,
    "};",
    ""
  ].join("\n"));

  const astroCommand = resolve(root, "node_modules", ".bin", process.platform === "win32" ? "astro.cmd" : "astro");
  try { await access(astroCommand); }
  catch { throw new Error("Missing astro. Install the Frontsite project dependencies first."); }
  return {
    framework: ASTRO_FRAMEWORK,
    entrypointPath,
    outputDirectory: resolve(root, "dist"),
    builtWranglerConfigPath: resolve(root, "dist", "server", "wrangler.json"),
    build: () => runCommand(root, astroCommand, ["build", "--config", relative(root, astroConfigPath)], env, undefined, "astro")
  };
}

async function readInstalledPackageVersion(root: string, name: string, required = true): Promise<string | undefined> {
  try {
    const contents = await readFile(resolve(root, "node_modules", ...name.split("/"), "package.json"), "utf8");
    const version = (JSON.parse(contents) as { version?: unknown }).version;
    if (typeof version !== "string" || !version) throw new Error(`Invalid installed package metadata for ${name}.`);
    return version;
  } catch (error) {
    if (!required && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Missing ${name}. Install the Frontsite project dependencies first.`);
    throw error;
  }
}
