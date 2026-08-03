import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { confirm, input, select } from "@inquirer/prompts";
import { runConnect } from "./connect-legacy.js";
import { INSTALLED_FRAMEWORKS, isFrameworkName, prepareFrameworkCloudflareBuild, resolveFramework } from "./frameworks/index.js";
import { inspectFrontsiteProject } from "./project.js";

const SCHEMA_VERSION = 1;
const require = createRequire(import.meta.url);
const BUNDLED_WRANGLER_PATH = resolve(dirname(require.resolve("wrangler/package.json")), "bin", "wrangler.js");

interface DeployConfig {
  schemaVersion: number;
  framework?: string;
  deployment: {
    provider: "cloudflare-workers";
    workerName?: string;
    compatibilityDate?: string;
    customDomain?: string | null;
  };
}

interface DeployDependencies {
  connect?: typeof runConnect;
  interactive?: boolean;
  wranglerPath?: string;
  npmPath?: string;
  cloudflareAdapterPath?: string;
  cloudflareEntrypointPath?: string;
  confirmCustomDomain?: () => Promise<boolean>;
  inputCustomDomain?: () => Promise<string>;
  selectCloudflareAccount?: (accounts: CloudflareAccount[]) => Promise<string>;
  reauth?: boolean;
  reconfigureDomain?: boolean;
}

interface CloudflareAccount {
  id: string;
  name: string;
}

interface WranglerIdentity {
  loggedIn: boolean;
  accounts?: CloudflareAccount[];
}

export async function runDeploy(directory: string, dependencies: DeployDependencies = {}): Promise<void> {
  const project = await inspectFrontsiteProject(directory);
  await loadEnvironment(project.root);
  const config = await readDeployConfig(project.root);
  const interactive = dependencies.interactive ?? Boolean(process.stdin.isTTY && !process.env.CI);
  if (dependencies.reconfigureDomain && !interactive) {
    throw new Error("Custom domain reconfiguration requires an interactive terminal.");
  }
  const workerName = normalizeWorkerName(config.deployment.workerName || process.env.APP_NAME || project.packageName);

  const commerceToken = await ensureCartoConnection(
    project.root,
    dependencies.connect ?? runConnect,
    interactive
  );
  requiredEnv("PUBLIC_COMMERCE_API_BASE_URL");

  const env = { ...process.env, NODE_ENV: "production", DEPLOYMENT_TARGET: "cloudflare-workers" };
  const wranglerPath = dependencies.wranglerPath ?? BUNDLED_WRANGLER_PATH;
  if (dependencies.reauth) {
    await reauthenticateCloudflare(project.root, wranglerPath, env, interactive);
  }
  await ensureCloudflareAuthentication(
    project.root,
    wranglerPath,
    env,
    interactive,
    dependencies.selectCloudflareAccount
  );
  const framework = await resolveFramework(project.root, project.packageJson, config.framework);
  const tempDir = await mkdtemp(resolve(project.root, ".carto-cloudflare-deploy-"));
  try {
    const wranglerConfigPath = resolve(tempDir, "wrangler.jsonc");
    const build = await prepareFrameworkCloudflareBuild(framework, {
      root: project.root,
      tempDir,
      wranglerConfigPath,
      env,
      npmPath: dependencies.npmPath ?? npmCommand(),
      runCommand,
      adapterPath: dependencies.cloudflareAdapterPath,
      entrypointPath: dependencies.cloudflareEntrypointPath
    });
    if (build.framework !== framework) throw new Error(`Framework adapter mismatch: expected ${framework}, received ${build.framework}.`);
    const persistDomainChoice = await selectCustomDomain(config, interactive, dependencies);
    await writeWranglerConfig(wranglerConfigPath, config, workerName, build.entrypointPath, build.outputDirectory);
    console.log(`Deploying ${workerName} to Cloudflare Workers...`);
    console.log(`1/4 Building storefront with the ${framework} adapter`);
    await build.build();
    console.log("2/4 Validating Worker package");
    await runWrangler(project.root, wranglerPath, ["deploy", "--dry-run", "--config", build.builtWranglerConfigPath], env);
    console.log("3/4 Syncing runtime secrets");
    await runWrangler(
      project.root,
      wranglerPath,
      ["secret", "bulk", "--config", build.builtWranglerConfigPath],
      env,
      `${JSON.stringify({ COMMERCE_API_TOKEN: commerceToken })}\n`
    );
    console.log("4/4 Publishing Worker");
    await runWrangler(project.root, wranglerPath, ["deploy", "--config", build.builtWranglerConfigPath], env);
    if (persistDomainChoice) await writeDeployConfig(project.root, config);
    console.log("Cloudflare deployment completed.");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function printDeployHelp(): void {
  console.log(`carto deploy

Deploy a Carto Frontsite project to Cloudflare Workers.

The project framework is selected through carto.config.json. Existing Astro
projects are detected automatically for backward compatibility.

Usage:
  carto deploy [project-directory] [--reauth] [--reconfigure-domain]

Options:
  --reauth             Clear the saved Cloudflare login and authorize again before deploying.
  --reconfigure-domain Ask again whether to bind a Cloudflare-managed custom domain.

Authentication:
  If the project is not connected to Carto, deploy starts browser authorization.
  Local deployments use Cloudflare browser authorization through Wrangler.
  CI deployments use CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.

CI requirements:
  COMMERCE_API_TOKEN
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_API_TOKEN

Custom domains:
  Interactive deployments can bind a Cloudflare-managed hostname.
  The selection is saved to carto.config.json after a successful deployment.
`);
}

async function reauthenticateCloudflare(
  root: string,
  wranglerPath: string,
  env: NodeJS.ProcessEnv,
  interactive: boolean
): Promise<void> {
  if (!interactive) {
    throw new Error("Cloudflare reauthentication requires an interactive terminal.");
  }
  clearCloudflareEnvironmentCredentials(env);
  console.log("Resetting Cloudflare authentication...");
  await runWrangler(root, wranglerPath, ["logout"], env);
  console.log("Opening Cloudflare authorization in your browser...");
  await runWrangler(root, wranglerPath, ["login", "--use-keyring"], env);
}

function clearCloudflareEnvironmentCredentials(env: NodeJS.ProcessEnv): void {
  for (const name of [
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_API_KEY",
    "CLOUDFLARE_EMAIL",
    "CF_ACCOUNT_ID",
    "CF_API_TOKEN",
    "CF_API_KEY",
    "CF_EMAIL"
  ]) {
    delete env[name];
  }
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

async function ensureCloudflareAuthentication(
  root: string,
  wranglerPath: string,
  env: NodeJS.ProcessEnv,
  interactive: boolean,
  selectAccount?: (accounts: CloudflareAccount[]) => Promise<string>
): Promise<void> {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();

  if (!accountId) delete env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiToken) delete env.CLOUDFLARE_API_TOKEN;

  if (apiToken && !accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is required when CLOUDFLARE_API_TOKEN is configured.");
  }

  let identity = await readWranglerIdentity(root, wranglerPath, env);
  if (identity?.loggedIn) {
    await selectCloudflareAccount(env, identity.accounts ?? [], interactive, selectAccount);
    return;
  }

  if (apiToken) {
    throw new Error("Cloudflare API credentials are configured but authentication failed. Check the account ID and API token.");
  }

  if (!interactive) {
    throw new Error(
      "Cloudflare authentication is required. Run this command in an interactive terminal to authorize in your browser, " +
      "or configure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN for CI."
    );
  }

  console.log("Opening Cloudflare authorization in your browser...");
  await runWrangler(root, wranglerPath, ["login", "--use-keyring"], env);
  identity = await readWranglerIdentity(root, wranglerPath, env);
  if (!identity?.loggedIn) {
    throw new Error("Cloudflare authorization did not complete. Run the deploy command again to retry.");
  }
  await selectCloudflareAccount(env, identity.accounts ?? [], interactive, selectAccount);
}

async function selectCloudflareAccount(
  env: NodeJS.ProcessEnv,
  accounts: CloudflareAccount[],
  interactive: boolean,
  choose?: (accounts: CloudflareAccount[]) => Promise<string>
): Promise<void> {
  if (env.CLOUDFLARE_ACCOUNT_ID) return;
  if (accounts.length === 1) {
    env.CLOUDFLARE_ACCOUNT_ID = accounts[0].id;
    return;
  }
  if (accounts.length === 0) {
    throw new Error("The authenticated Cloudflare user does not have access to an account.");
  }
  if (!interactive) {
    throw new Error("Multiple Cloudflare accounts are available. Configure CLOUDFLARE_ACCOUNT_ID for this deployment.");
  }
  const selected = choose
    ? await choose(accounts)
    : await select({
        message: "Select a Cloudflare account:",
        choices: accounts.map((account) => ({ name: account.name, value: account.id }))
      });
  if (!accounts.some((account) => account.id === selected)) {
    throw new Error("The selected Cloudflare account is not available to the authenticated user.");
  }
  env.CLOUDFLARE_ACCOUNT_ID = selected;
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
    if (parsed.framework !== undefined && (typeof parsed.framework !== "string" || !isFrameworkName(parsed.framework))) {
      throw new Error(`Unsupported framework "${String(parsed.framework)}". Installed adapters: ${INSTALLED_FRAMEWORKS.join(", ")}.`);
    }
    if (parsed.deployment.customDomain !== undefined && parsed.deployment.customDomain !== null) {
      if (typeof parsed.deployment.customDomain !== "string") {
        throw new Error("deployment.customDomain must be a hostname or null.");
      }
      parsed.deployment.customDomain = normalizeCustomDomain(parsed.deployment.customDomain);
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { schemaVersion: SCHEMA_VERSION, deployment: { provider: "cloudflare-workers" } };
  }
}

async function selectCustomDomain(
  config: DeployConfig,
  interactive: boolean,
  dependencies: DeployDependencies
): Promise<boolean> {
  if (dependencies.reconfigureDomain) {
    if (!interactive) {
      throw new Error("Custom domain reconfiguration requires an interactive terminal.");
    }
    delete config.deployment.customDomain;
  }
  if (!interactive || config.deployment.customDomain !== undefined) return false;
  const approved = dependencies.confirmCustomDomain
    ? await dependencies.confirmCustomDomain()
    : await confirm({ message: "Bind a custom domain managed by Cloudflare?", default: false });
  if (!approved) {
    config.deployment.customDomain = null;
    return true;
  }
  const value = dependencies.inputCustomDomain
    ? await dependencies.inputCustomDomain()
    : await input({ message: "Custom domain (for example, shop.example.com):" });
  config.deployment.customDomain = normalizeCustomDomain(value);
  return true;
}

async function writeDeployConfig(root: string, config: DeployConfig): Promise<void> {
  await writeFile(resolve(root, "carto.config.json"), `${JSON.stringify(config, null, 2)}\n`);
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

async function writeWranglerConfig(
  wranglerConfigPath: string,
  config: DeployConfig,
  workerName: string,
  entrypointPath: string,
  outputDirectory: string
): Promise<void> {
  const wrangler: Record<string, unknown> = {
    name: workerName,
    main: entrypointPath,
    compatibility_date: config.deployment.compatibilityDate || "2025-04-01",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: true,
    preview_urls: true,
    assets: { binding: "ASSETS", directory: outputDirectory },
    observability: { enabled: true }
  };
  if (config.deployment.customDomain) {
    wrangler.routes = [{ pattern: config.deployment.customDomain, custom_domain: true }];
  }
  const runtimeVars = Object.fromEntries(
    [
      "PUBLIC_COMMERCE_API_BASE_URL",
      "PUBLIC_MAPBOX_ACCESS_TOKEN",
      "PUBLIC_GTM_ID",
      "PAGE_CACHE_PREFIX"
    ].flatMap((name) => {
      const value = process.env[name]?.trim();
      return value ? [[name, value]] : [];
    })
  );
  if (Object.keys(runtimeVars).length > 0) wrangler.vars = runtimeVars;
  if (process.env.CLOUDFLARE_KV_NAMESPACE_ID) {
    wrangler.kv_namespaces = [
      { binding: "SESSION" },
      { binding: "KV_STORE", id: process.env.CLOUDFLARE_KV_NAMESPACE_ID }
    ];
  } else {
    wrangler.kv_namespaces = [{ binding: "SESSION" }];
  }
  await writeFile(wranglerConfigPath, `${JSON.stringify(wrangler, null, 2)}\n`);
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

function normalizeCustomDomain(value: string): string {
  const candidate = value.trim().toLowerCase();
  if (!candidate || candidate.includes("://") || /[/?#:*]/.test(candidate)) {
    throw new Error("The custom domain must be a hostname without a protocol, path, port, or wildcard.");
  }
  let hostname: string;
  try { hostname = new URL(`https://${candidate}`).hostname; }
  catch { throw new Error("The custom domain is not a valid hostname."); }
  if (hostname !== candidate || hostname.length > 253 || !hostname.includes(".")) {
    throw new Error("The custom domain must be a valid domain or subdomain.");
  }
  const labels = hostname.split(".");
  if (labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new Error("The custom domain contains an invalid DNS label.");
  }
  return hostname;
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function runCommand(
  root: string,
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  stdin?: string,
  displayName = executable
): Promise<void> {
  await new Promise<void>((done, reject) => {
    const isNodeScript = /\.(?:cjs|mjs|js)$/i.test(executable);
    const child = spawn(isNodeScript ? process.execPath : executable, isNodeScript ? [executable, ...args] : args, {
      cwd: root,
      env,
      stdio: [stdin === undefined ? "inherit" : "pipe", "inherit", "inherit"],
      shell: !isNodeScript && process.platform === "win32"
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) done();
      else reject(new Error(`${displayName} ${args.join(" ")} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`));
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

async function readWranglerIdentity(
  root: string,
  wranglerPath: string,
  env: NodeJS.ProcessEnv
): Promise<WranglerIdentity | undefined> {
  return new Promise<WranglerIdentity | undefined>((done) => {
    const child = spawn(process.execPath, [wranglerPath, "whoami", "--json"], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "ignore"]
    });
    let output = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => { output += chunk; });
    child.once("error", () => done(undefined));
    child.once("exit", (code) => {
      if (code !== 0) return done(undefined);
      try { done(JSON.parse(output) as WranglerIdentity); }
      catch { done(undefined); }
    });
  });
}
