import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inspectFrontsiteProject } from "./project.js";

const SCHEMA_VERSION = 1;

interface DeployConfig {
  schemaVersion: number;
  deployment: {
    provider: "cloudflare-workers";
    workerName?: string;
    compatibilityDate?: string;
  };
}

export async function runDeploy(directory: string): Promise<void> {
  const project = await inspectFrontsiteProject(directory);
  await loadEnvironment(project.root);
  const config = await readDeployConfig(project.root);
  const workerName = normalizeWorkerName(config.deployment.workerName || process.env.APP_NAME || project.packageName);

  requiredEnv("CLOUDFLARE_ACCOUNT_ID");
  requiredEnv("CLOUDFLARE_API_TOKEN");
  const commerceToken = requiredEnv("COMMERCE_API_TOKEN");
  await requireProjectCommand(project.root, "astro");
  await requireProjectCommand(project.root, "wrangler");
  await writeWranglerConfig(project.root, config, workerName);

  const env = { ...process.env, NODE_ENV: "production", DEPLOYMENT_TARGET: "cloudflare-workers" };
  console.log(`Deploying ${workerName} to Cloudflare Workers...`);
  console.log("1/3 Building storefront");
  await runProjectCommand(project.root, "astro", ["build"], env);
  console.log("2/3 Syncing runtime secrets");
  await runProjectCommand(
    project.root,
    "wrangler",
    ["secret", "bulk"],
    env,
    `${JSON.stringify({ COMMERCE_API_TOKEN: commerceToken })}\n`
  );
  console.log("3/3 Publishing Worker");
  await runProjectCommand(project.root, "wrangler", ["deploy"], env);
  console.log("Cloudflare deployment completed.");
}

export function printDeployHelp(): void {
  console.log(`carto deploy

Deploy a Carto Frontsite project to Cloudflare Workers.

Usage:
  carto deploy [project-directory]

Required environment variables:
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_API_TOKEN
  COMMERCE_API_TOKEN
`);
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

async function loadEnvironment(root: string): Promise<void> {
  const inherited = new Set(Object.keys(process.env));
  for (const filename of [".env", ".env.production"]) {
    let contents: string;
    try { contents = await readFile(resolve(root, filename), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match || inherited.has(match[1])) continue;
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

async function writeWranglerConfig(root: string, config: DeployConfig, workerName: string): Promise<void> {
  const wrangler: Record<string, unknown> = {
    $schema: "./node_modules/wrangler/config-schema.json",
    name: workerName,
    main: "@astrojs/cloudflare/entrypoints/server",
    compatibility_date: config.deployment.compatibilityDate || "2026-08-01",
    compatibility_flags: ["nodejs_compat"],
    assets: { binding: "ASSETS", directory: "./dist" },
    observability: { enabled: true }
  };
  if (process.env.PAGE_CACHE_PREFIX) wrangler.vars = { PAGE_CACHE_PREFIX: process.env.PAGE_CACHE_PREFIX };
  if (process.env.CLOUDFLARE_KV_NAMESPACE_ID) {
    wrangler.kv_namespaces = [{ binding: "KV_STORE", id: process.env.CLOUDFLARE_KV_NAMESPACE_ID }];
  }
  await writeFile(resolve(root, "wrangler.jsonc"), `${JSON.stringify(wrangler, null, 2)}\n`);
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
