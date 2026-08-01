import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { runConnect } from "./connect.js";
import { inspectFrontsiteProject } from "./project.js";

const SCHEMA_VERSION = 1;
const require = createRequire(import.meta.url);
const BUNDLED_WRANGLER_PATH = resolve(dirname(require.resolve("wrangler/package.json")), "bin", "wrangler.js");
const BUNDLED_CLOUDFLARE_ADAPTER_PATH = require.resolve("@astrojs/cloudflare");
const BUNDLED_CLOUDFLARE_ENTRYPOINT_PATH = require.resolve("@astrojs/cloudflare/entrypoints/server");

interface DeployConfig {
  schemaVersion: number;
  deployment: {
    provider: "cloudflare-workers";
    workerName?: string;
    compatibilityDate?: string;
  };
}

interface DeployDependencies {
  connect?: typeof runConnect;
  interactive?: boolean;
  wranglerPath?: string;
  cloudflareAdapterPath?: string;
  cloudflareEntrypointPath?: string;
}

export async function runDeploy(directory: string, dependencies: DeployDependencies = {}): Promise<void> {
  const project = await inspectFrontsiteProject(directory);
  await loadEnvironment(project.root);
  const config = await readDeployConfig(project.root);
  const workerName = normalizeWorkerName(config.deployment.workerName || process.env.APP_NAME || project.packageName);

  const commerceToken = await ensureCartoConnection(
    project.root,
    dependencies.connect ?? runConnect,
    dependencies.interactive ?? Boolean(process.stdin.isTTY && !process.env.CI)
  );
  await requireProjectCommand(project.root, "astro");

  const env = { ...process.env, NODE_ENV: "production", DEPLOYMENT_TARGET: "cloudflare-workers" };
  const wranglerPath = dependencies.wranglerPath ?? BUNDLED_WRANGLER_PATH;
  await ensureCloudflareAuthentication(project.root, wranglerPath, env);
  const deploymentFiles = await createDeploymentFiles(
    project.root,
    config,
    workerName,
    dependencies.cloudflareAdapterPath ?? BUNDLED_CLOUDFLARE_ADAPTER_PATH,
    dependencies.cloudflareEntrypointPath ?? BUNDLED_CLOUDFLARE_ENTRYPOINT_PATH
  );
  try {
    console.log(`Deploying ${workerName} to Cloudflare Workers...`);
    console.log("1/4 Building storefront with the Cloudflare adapter");
    await runProjectCommand(
      project.root,
      "astro",
      ["build", "--config", relative(project.root, deploymentFiles.astroConfigPath)],
      env
    );
    console.log("2/4 Validating Worker package");
    await runWrangler(project.root, wranglerPath, ["deploy", "--dry-run", "--config", deploymentFiles.wranglerConfigPath], env);
    console.log("3/4 Syncing runtime secrets");
    await runWrangler(
      project.root,
      wranglerPath,
      ["secret", "bulk", "--config", deploymentFiles.wranglerConfigPath],
      env,
      `${JSON.stringify({ COMMERCE_API_TOKEN: commerceToken })}\n`
    );
    console.log("4/4 Publishing Worker");
    await runWrangler(project.root, wranglerPath, ["deploy", "--config", deploymentFiles.wranglerConfigPath], env);
    console.log("Cloudflare deployment completed.");
  } finally {
    await rm(deploymentFiles.tempDir, { recursive: true, force: true });
  }
}

export function printDeployHelp(): void {
  console.log(`carto deploy

Deploy a Carto Frontsite project to Cloudflare Workers.

Usage:
  carto deploy [project-directory]

Authentication:
  If the project is not connected to Carto, deploy starts browser authorization.
  Local deployments use Cloudflare browser authorization through Wrangler.
  CI deployments use CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.

CI requirements:
  COMMERCE_API_TOKEN
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_API_TOKEN
`);
}

async function ensureCartoConnection(
  root: string,
  connect: typeof runConnect,
  interactive: boolean
): Promise<string> {
  const existingToken = process.env.COMMERCE_API_TOKEN?.trim();
  if (existingToken) return existingToken;
  if (!interactive) {
    throw new Error(
      "Carto connection is required. Run this command in an interactive terminal to connect in your browser, " +
      "or configure COMMERCE_API_TOKEN for CI."
    );
  }

  console.log("This Frontsite is not connected to Carto. Starting authorization...");
  await connect({ command: "connect", projectDir: root, openBrowser: true, yes: false });
  await loadEnvironment(root, new Set(["PUBLIC_COMMERCE_API_BASE_URL", "COMMERCE_API_TOKEN"]));
  return requiredEnv("COMMERCE_API_TOKEN");
}

async function ensureCloudflareAuthentication(root: string, wranglerPath: string, env: NodeJS.ProcessEnv): Promise<void> {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
  const hasConfiguredApiCredentials = Boolean(accountId || apiToken);

  if (!accountId) delete env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiToken) delete env.CLOUDFLARE_API_TOKEN;

  if (hasConfiguredApiCredentials && (!accountId || !apiToken)) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be configured together.");
  }

  if (await wranglerSucceeds(root, wranglerPath, ["whoami", "--json"], env)) return;

  if (hasConfiguredApiCredentials) {
    throw new Error("Cloudflare API credentials are configured but authentication failed. Check the account ID and API token.");
  }

  if (!process.stdin.isTTY || process.env.CI) {
    throw new Error(
      "Cloudflare authentication is required. Run this command in an interactive terminal to authorize in your browser, " +
      "or configure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN for CI."
    );
  }

  console.log("Opening Cloudflare authorization in your browser...");
  await runWrangler(root, wranglerPath, ["login", "--use-keyring"], env);
  if (!(await wranglerSucceeds(root, wranglerPath, ["whoami", "--json"], env))) {
    throw new Error("Cloudflare authorization did not complete. Run the deploy command again to retry.");
  }
}

async function readDeployConfig(root: string): Promise<DeployConfig> {
  try {
    const parsed = JSON.parse(await readFile(resolve(root, "carto.config.json"), "utf8")) as DeployConfig;
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`Unsupported carto.config.json schemaVersion ${String(parsed.schemaVersion)}; expected ${SCHEMA_VERSION}.`);
    }
    if (parsed.deployment?.provider !== "cloudflare-workers") {
      throw new Error(`Unsupported deployment provider "${String(parsed.deployment?.provider)}".`);
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { schemaVersion: SCHEMA_VERSION, deployment: { provider: "cloudflare-workers" } };
  }
}

async function loadEnvironment(root: string, overwrite: ReadonlySet<string> = new Set()): Promise<void> {
  const inherited = new Set(Object.keys(process.env));
  for (const filename of [".env", ".env.production"]) {
    let contents: string;
    try { contents = await readFile(resolve(root, filename), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match || (inherited.has(match[1]) && !overwrite.has(match[1]))) continue;
      process.env[match[1]] = parseEnvValue(match[2]);
    }
  }
}

function parseEnvValue(raw: string): string {
  const value = raw.trim();
  const quote = value[0];
  if ((quote === "\"" || quote === "'") && value.endsWith(quote)) return value.slice(1, -1);
  const comment = value.indexOf(" #");
  return comment >= 0 ? value.slice(0, comment).trim() : value;
}

async function createDeploymentFiles(
  root: string,
  config: DeployConfig,
  workerName: string,
  cloudflareAdapterPath: string,
  cloudflareEntrypointPath: string
): Promise<{ tempDir: string; astroConfigPath: string; wranglerConfigPath: string }> {
  const tempDir = await mkdtemp(resolve(root, ".carto-cloudflare-deploy-"));
  const astroConfigPath = resolve(tempDir, "astro.config.mjs");
  const wranglerConfigPath = resolve(tempDir, "wrangler.jsonc");
  const originalConfigUrl = pathToFileURL(resolve(root, "astro.config.mjs")).href;
  const adapterUrl = pathToFileURL(cloudflareAdapterPath).href;
  const rootUrl = pathToFileURL(root.endsWith(sep) ? root : `${root}${sep}`).href;
  await writeFile(astroConfigPath, [
    `import cloudflare from ${JSON.stringify(adapterUrl)};`,
    `import originalConfig from ${JSON.stringify(originalConfigUrl)};`,
    "const base = typeof originalConfig === 'function'",
    "  ? await originalConfig({ command: 'build', mode: 'production' })",
    "  : await originalConfig;",
    "export default {",
    "  ...base,",
    `  root: new URL(${JSON.stringify(rootUrl)}),`,
    "  output: 'server',",
    "  adapter: cloudflare(),",
    "};",
    ""
  ].join("\n"));

  const wrangler: Record<string, unknown> = {
    name: workerName,
    main: cloudflareEntrypointPath,
    compatibility_date: config.deployment.compatibilityDate || "2026-08-01",
    compatibility_flags: ["nodejs_compat"],
    assets: { binding: "ASSETS", directory: resolve(root, "dist") },
    observability: { enabled: true }
  };
  if (process.env.PAGE_CACHE_PREFIX) wrangler.vars = { PAGE_CACHE_PREFIX: process.env.PAGE_CACHE_PREFIX };
  if (process.env.CLOUDFLARE_KV_NAMESPACE_ID) {
    wrangler.kv_namespaces = [{ binding: "KV_STORE", id: process.env.CLOUDFLARE_KV_NAMESPACE_ID }];
  }
  await writeFile(wranglerConfigPath, `${JSON.stringify(wrangler, null, 2)}\n`);
  return { tempDir, astroConfigPath, wranglerConfigPath };
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}. Add it to .env or the current environment.`);
  return value;
}

function normalizeWorkerName(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
  if (!normalized) throw new Error("The Worker name must contain at least one letter or number.");
  return normalized;
}

async function requireProjectCommand(root: string, command: string): Promise<void> {
  try { await access(commandPath(root, command)); }
  catch { throw new Error(`Missing ${command}. Install the Frontsite project dependencies first.`); }
}

function commandPath(root: string, command: string): string {
  return resolve(root, "node_modules", ".bin", process.platform === "win32" ? `${command}.cmd` : command);
}

async function runProjectCommand(root: string, command: string, args: string[], env: NodeJS.ProcessEnv, stdin?: string): Promise<void> {
  await new Promise<void>((done, reject) => {
    const child = spawn(commandPath(root, command), args, {
      cwd: root,
      env,
      stdio: [stdin === undefined ? "inherit" : "pipe", "inherit", "inherit"],
      shell: process.platform === "win32"
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) done();
      else reject(new Error(`${command} ${args.join(" ")} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`));
    });
    if (stdin !== undefined) child.stdin?.end(stdin);
  });
}

async function runWrangler(root: string, wranglerPath: string, args: string[], env: NodeJS.ProcessEnv, stdin?: string): Promise<void> {
  await new Promise<void>((done, reject) => {
    const child = spawn(process.execPath, [wranglerPath, ...args], {
      cwd: root,
      env,
      stdio: [stdin === undefined ? "inherit" : "pipe", "inherit", "inherit"]
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) done();
      else reject(new Error(`wrangler ${args.join(" ")} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`));
    });
    if (stdin !== undefined) child.stdin?.end(stdin);
  });
}

async function wranglerSucceeds(root: string, wranglerPath: string, args: string[], env: NodeJS.ProcessEnv): Promise<boolean> {
  return new Promise<boolean>((done) => {
    const child = spawn(process.execPath, [wranglerPath, ...args], {
      cwd: root,
      env,
      stdio: "ignore"
    });
    child.once("error", () => done(false));
    child.once("exit", (code) => done(code === 0));
  });
}
