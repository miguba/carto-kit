import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { StorefrontAnswers } from "./prompts.js";
import { assertCanRead, inspectTargetDirectory } from "./validators.js";

export interface ScaffoldResult {
  projectDir: string;
  packageManager: "npm" | "yarn" | "pnpm";
}

const here = dirname(fileURLToPath(import.meta.url));

export async function scaffoldStorefront(answers: StorefrontAnswers): Promise<ScaffoldResult> {
  const projectDir = resolve(process.cwd(), answers.projectName);
  await prepareTargetDirectory(projectDir, answers);

  const templateDir = resolve(here, "..", "templates", answers.template);
  await assertCanRead(templateDir);

  await mkdir(projectDir, { recursive: true });
  await cp(templateDir, projectDir, {
    recursive: true,
    filter: (source) => {
      const segments = relative(templateDir, source).split(sep);
      return !segments.includes("node_modules") && !segments.includes(".astro") && !segments.includes("dist");
    }
  });

  await renameIfExists(resolve(projectDir, "_gitignore"), resolve(projectDir, ".gitignore"));

  await replaceTemplateVars(projectDir, answers);
  await writeFile(resolve(projectDir, ".env"), buildEnvFile(answers), { mode: 0o600 });

  if (answers.deploymentTarget !== "vps") {
    await rm(resolve(projectDir, "scripts", "deploy-vps.mjs"), { force: true });
    await rm(resolve(projectDir, "scripts", "bootstrap-vps.sh"), { force: true });
    await removePackageScript(projectDir, "deploy:vps");
  }

  if (answers.deploymentTarget !== "cloudflare-workers") {
    await removePackageScript(projectDir, "gen:wc");
    await removePackageScript(projectDir, "wrangler:check");
    if (answers.deploymentTarget === "vps") {
      await setPackageScript(projectDir, "deploy", getVpsDeployScript(answers.template));
    } else {
      await removePackageScript(projectDir, "deploy");
    }
  }

  if (answers.template === "multi-product" && answers.deploymentTarget !== "cloudflare-workers") {
    await stripCloudflareArtifacts(projectDir, answers);
  }

  return { projectDir, packageManager: detectPackageManager() };
}

async function prepareTargetDirectory(projectDir: string, answers: StorefrontAnswers): Promise<void> {
  const status = await inspectTargetDirectory(projectDir);
  if (status.kind === "missing" || status.kind === "empty") return;
  if (status.kind === "not-directory") {
    throw new Error(`${status.path} exists and is not a directory.`);
  }
  if (answers.targetDirectoryAction === "reset") {
    await rm(projectDir, { recursive: true, force: true });
    return;
  }
  if (answers.targetDirectoryAction === "overwrite") return;
  throw new Error(`${status.path} already exists and is not empty.`);
}

async function removePackageScript(projectDir: string, scriptName: string): Promise<void> {
  const packagePath = resolve(projectDir, "package.json");
  const pkg = JSON.parse(await readFile(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  if (pkg.scripts) {
    delete pkg.scripts[scriptName];
  }
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

async function setPackageScript(projectDir: string, scriptName: string, command: string): Promise<void> {
  const packagePath = resolve(projectDir, "package.json");
  const pkg = JSON.parse(await readFile(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  pkg.scripts = pkg.scripts ?? {};
  pkg.scripts[scriptName] = command;
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function getVpsDeployScript(template: StorefrontAnswers["template"]): string {
  if (template === "multi-product") {
    return "DEPLOYMENT_TARGET=vps node scripts/deploy-vps.mjs";
  }
  return "node scripts/deploy-vps.mjs";
}

async function stripCloudflareArtifacts(projectDir: string, answers: StorefrontAnswers): Promise<void> {
  await rm(resolve(projectDir, "scripts", "prepare-deploy-config.ts"), { force: true });
  await rm(resolve(projectDir, "wrangler.jsonc"), { force: true });
  await rm(resolve(projectDir, "wrangler-prod.jsonc"), { force: true });
  await rm(resolve(projectDir, "package-lock.json"), { force: true });
  await rewriteAstroConfigForNode(projectDir);

  const packagePath = resolve(projectDir, "package.json");
  const pkg = JSON.parse(await readFile(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    overrides?: Record<string, string>;
  };

  pkg.scripts = pkg.scripts ?? {};
  pkg.scripts.build = "astro build";
  delete pkg.scripts["gen:wc"];
  delete pkg.scripts["wrangler:check"];
  if (answers.deploymentTarget === "vps") {
    pkg.scripts.deploy = getVpsDeployScript(answers.template);
  } else {
    delete pkg.scripts.deploy;
  }

  delete pkg.dependencies?.["@astrojs/cloudflare"];
  delete pkg.devDependencies?.wrangler;
  delete pkg.devDependencies?.tsx;
  delete pkg.overrides;

  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

  const envExamplePath = resolve(projectDir, ".env.example");
  const envExample = await readOptionalFile(envExamplePath);
  if (envExample !== null) {
    await writeFile(envExamplePath, removeCloudflareEnvBlock(envExample));
  }
}

function removeCloudflareEnvBlock(contents: string): string {
  return contents
    .replace(/\n?# Cloudflare deploy only\nCLOUDFLARE_ACCOUNT_ID=\nCLOUDFLARE_API_TOKEN=\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

async function rewriteAstroConfigForNode(projectDir: string): Promise<void> {
  const configPath = resolve(projectDir, "astro.config.mjs");
  const config = await readOptionalFile(configPath);
  if (config === null) return;

  const nodeOnlyConfig = config.replace(
    /const deploymentTarget = process\.env\.DEPLOYMENT_TARGET \|\| "[^"]+";\nconst adapter = deploymentTarget === "cloudflare-workers"\n  \? \(await import\("@astrojs\/cloudflare"\)\)\.default\(\)\n  : node\(\{ mode: "standalone" \}\);/,
    'const adapter = node({ mode: "standalone" });'
  );

  await writeFile(configPath, nodeOnlyConfig);
}

async function replaceTemplateVars(projectDir: string, answers: StorefrontAnswers): Promise<void> {
  const siteName = toTitleName(answers.projectName);
  const appName = toAppName(answers.projectName);
  const supportEmail = `support@${answers.siteDomain}`;
  const privacyEmail = `privacy@${answers.siteDomain}`;
  const currentYear = String(new Date().getFullYear());
  const replacements = new Map([
    ["__PROJECT_NAME__", answers.projectName],
    ["__EMS_API_BASE_URL__", answers.commerceApiBaseUrl],
    ["__EMS_SITE_DOMAIN__", answers.siteDomain],
    ["__PUBLIC_SITE_URL__", `https://${answers.siteDomain}`],
    ["__FRONTEND_MODE__", answers.frontendMode],
    ["__DEPLOYMENT_TARGET__", answers.deploymentTarget],
    ["__APP_NAME__", appName],
    ["__SITE_NAME__", siteName],
    ["__SITE_LEGAL_NAME__", siteName],
    ["__SUPPORT_EMAIL__", supportEmail],
    ["__PRIVACY_EMAIL__", privacyEmail],
    ["__POLICY_UPDATED_AT__", new Intl.DateTimeFormat("en", {
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(new Date())],
    ["__COPYRIGHT_YEAR__", currentYear]
  ]);

  const files = ["package.json", "README.md", ".env.example", "astro.config.mjs", "commerce-api.md", "src/lib/config.ts"];
  for (const file of files) {
    const path = resolve(projectDir, file);
    let contents = await readOptionalFile(path);
    if (contents === null) continue;
    for (const [key, value] of replacements) {
      contents = contents.replaceAll(key, value);
    }
    await writeFile(path, contents);
  }
}

function buildEnvFile(answers: StorefrontAnswers): string {
  if (answers.template === "multi-product") {
    return buildMultiProductEnvFile(answers);
  }

  const lines = [
    `EMS_SITE_DOMAIN=${answers.siteDomain}`,
    `PUBLIC_SITE_URL=https://${answers.siteDomain}`,
    "PRODUCT_DETAIL_URL_TEMPLATE=/products/{slug}",
    "",
    "# SSR only. Do not expose this to browser bundles.",
    "EMS_SERVER_APP_TOKEN=",
    "",
    "# Frontend build mode: ssr or static.",
    `FRONTEND_MODE=${answers.frontendMode}`
  ];
  if (answers.deploymentTarget === "vps") {
    lines.push(
      "",
      "# VPS deploy",
      `VPS_HOST=${answers.vps.host}`,
      `VPS_PORT=${answers.vps.port}`,
      `VPS_USER=${answers.vps.user}`,
      `VPS_SSH_KEY=${answers.vps.sshKey}`,
      `VPS_DEPLOY_DIR=${answers.vps.deployDir}`,
      `VPS_PM2_APP_NAME=${answers.vps.pm2AppName}`,
      `VPS_APP_PORT=${answers.vps.appPort}`,
      `VPS_CADDY_DOMAIN=${answers.vps.caddyDomain}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildMultiProductEnvFile(answers: StorefrontAnswers): string {
  const lines = [
    `APP_NAME=${toAppName(answers.projectName)}`,
    "APP_ENV=development",
    `DEPLOYMENT_TARGET=${answers.deploymentTarget}`,
    "",
    `COMMERCE_API_TOKEN=${formatEnvValue(answers.commerceApiToken)}`,
    "",
    "PUBLIC_MAPBOX_ACCESS_TOKEN="
  ];

  if (answers.deploymentTarget === "cloudflare-workers") {
    lines.unshift(
      `CLOUDFLARE_ACCOUNT_ID=${formatEnvValue(answers.cloudflare.accountId)}`,
      `CLOUDFLARE_API_TOKEN=${formatEnvValue(answers.cloudflare.apiToken)}`,
      ""
    );
  }

  if (answers.deploymentTarget === "vps") {
    lines.push(
      "",
      "# VPS deploy",
      `VPS_HOST=${answers.vps.host}`,
      `VPS_PORT=${answers.vps.port}`,
      `VPS_USER=${answers.vps.user}`,
      `VPS_SSH_KEY=${answers.vps.sshKey}`,
      `VPS_DEPLOY_DIR=${answers.vps.deployDir}`,
      `VPS_PM2_APP_NAME=${answers.vps.pm2AppName}`,
      `VPS_APP_PORT=${answers.vps.appPort}`,
      `VPS_CADDY_DOMAIN=${answers.vps.caddyDomain}`
    );
  }

  return `${lines.join("\n")}\n`;
}

function formatEnvValue(value: string | undefined): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "";
  return JSON.stringify(normalized);
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function renameIfExists(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function detectPackageManager(): "npm" | "yarn" | "pnpm" {
  const userAgent = process.env.npm_config_user_agent ?? "";
  if (userAgent.startsWith("yarn")) return "yarn";
  if (userAgent.startsWith("pnpm")) return "pnpm";
  return "npm";
}

function toAppName(name: string): string {
  return name
    .replace(/^@/, "")
    .replace(/\//g, "-")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "carto";
}

function toTitleName(name: string): string {
  return toAppName(name)
    .split(/[-.]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "Carto Storefront";
}
