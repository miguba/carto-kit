import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { StorefrontAnswers } from "./prompts.js";
import { assertCanRead, validateTargetDirectory } from "./validators.js";

export interface ScaffoldResult {
  projectDir: string;
  packageManager: "npm" | "yarn" | "pnpm";
}

const here = dirname(fileURLToPath(import.meta.url));

export async function scaffoldStorefront(answers: StorefrontAnswers): Promise<ScaffoldResult> {
  const projectDir = resolve(process.cwd(), answers.projectName);
  await validateTargetDirectory(projectDir);

  const templateDir = resolve(here, "..", "templates", answers.template);
  await assertCanRead(templateDir);

  await mkdir(projectDir, { recursive: true });
  await cp(templateDir, projectDir, {
    recursive: true,
    filter: (source) => !source.includes("node_modules") && !source.includes("/.astro") && !source.includes("/dist")
  });

  await renameIfExists(resolve(projectDir, "_gitignore"), resolve(projectDir, ".gitignore"));

  await replaceTemplateVars(projectDir, answers);
  await writeFile(resolve(projectDir, ".env"), buildEnvFile(answers), { mode: 0o600 });

  if (answers.deploymentTarget !== "vps" || answers.template !== "astro-storefront") {
    await rm(resolve(projectDir, "scripts", "deploy-vps.mjs"), { force: true });
    await removePackageScript(projectDir, "deploy:vps");
  }

  if (answers.template !== "astro-commerce-cloudflare") {
    await removePackageScript(projectDir, "gen:wc");
    await removePackageScript(projectDir, "wrangler:check");
    await removePackageScript(projectDir, "deploy");
  }

  return { projectDir, packageManager: detectPackageManager() };
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

async function replaceTemplateVars(projectDir: string, answers: StorefrontAnswers): Promise<void> {
  const siteName = toTitleName(answers.projectName);
  const appName = toAppName(answers.projectName);
  const supportEmail = `support@${answers.siteDomain}`;
  const privacyEmail = `privacy@${answers.siteDomain}`;
  const currentYear = String(new Date().getFullYear());
  const replacements = new Map([
    ["__PROJECT_NAME__", answers.projectName],
    ["__EMS_API_BASE_URL__", answers.emsApiUrl],
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

  const files = ["package.json", "README.md", ".env.example", "astro.config.mjs", "commerce-api.md"];
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
  if (answers.template === "astro-commerce-cloudflare") {
    return buildCloudflareEnvFile(answers);
  }

  const lines = [
    `EMS_API_BASE_URL=${answers.emsApiUrl}`,
    `EMS_SITE_DOMAIN=${answers.siteDomain}`,
    `PUBLIC_SITE_URL=https://${answers.siteDomain}`,
    "PRODUCT_DETAIL_URL_TEMPLATE=/products/{slug}",
    "",
    "# SSR only. Do not expose this to browser bundles.",
    "EMS_SERVER_APP_TOKEN=",
    "",
    "# Frontend build mode: ssr or static.",
    `FRONTEND_MODE=${answers.frontendMode}`,
    "",
    "# VPS deploy",
    `VPS_HOST=${answers.vps.host}`,
    `VPS_PORT=${answers.vps.port}`,
    `VPS_USER=${answers.vps.user}`,
    `VPS_SSH_KEY=${answers.vps.sshKey}`,
    `VPS_DEPLOY_DIR=${answers.vps.deployDir}`,
    `VPS_PM2_APP_NAME=${answers.vps.pm2AppName}`,
    `VPS_CADDY_DOMAIN=${answers.vps.caddyDomain}`
  ];
  return `${lines.join("\n")}\n`;
}

function buildCloudflareEnvFile(answers: StorefrontAnswers): string {
  const siteName = toTitleName(answers.projectName);
  const currentYear = String(new Date().getFullYear());
  const lines = [
    "CLOUDFLARE_ACCOUNT_ID=",
    "CLOUDFLARE_API_TOKEN=",
    "",
    `APP_NAME=${toAppName(answers.projectName)}`,
    "APP_ENV=development",
    "",
    `PUBLIC_COMMERCE_API_BASE_URL=${answers.emsApiUrl}`,
    "COMMERCE_API_TOKEN=",
    "",
    "PUBLIC_CDN_BASE_URL=",
    "",
    "PUBLIC_FEATURED_PRODUCT_SLUG=",
    "PUBLIC_MAPBOX_ACCESS_TOKEN=",
    "",
    `PUBLIC_SITE_NAME=${siteName}`,
    `PUBLIC_SITE_LEGAL_NAME=${siteName}`,
    `PUBLIC_SITE_DOMAIN=${answers.siteDomain}`,
    `PUBLIC_SUPPORT_EMAIL=support@${answers.siteDomain}`,
    `PUBLIC_PRIVACY_EMAIL=privacy@${answers.siteDomain}`,
    "PUBLIC_SUPPORT_RESPONSE_TIME=1-2 business days",
    `PUBLIC_POLICY_UPDATED_AT=${new Intl.DateTimeFormat("en", {
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(new Date())}`,
    `PUBLIC_COPYRIGHT_YEAR=${currentYear}`
  ];
  return `${lines.join("\n")}\n`;
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
