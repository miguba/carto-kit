import { resolve } from "node:path";
import { input, password, select } from "@inquirer/prompts";
import type { DeploymentTarget, FrontendMode, StorefrontTemplate } from "./validators.js";
import { inspectTargetDirectory, validateCaddyDomains, validateDomain, validateProjectName } from "./validators.js";
import { resolveCommerceApiBaseUrl } from "./user-config.js";

export interface CliOptions {
  site?: string;
  token?: string;
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
  commerceApiBaseUrl?: string;
  template?: StorefrontTemplate;
  mode?: FrontendMode;
  deploy?: DeploymentTarget;
  yes?: boolean;
}

export interface StorefrontAnswers {
  projectName: string;
  targetDirectoryAction?: TargetDirectoryAction;
  template: StorefrontTemplate;
  commerceApiToken: string;
  commerceApiBaseUrl: string;
  siteDomain: string;
  frontendMode: FrontendMode;
  deploymentTarget: DeploymentTarget;
  cloudflare: CloudflareAnswers;
  vps: VpsAnswers;
}

export interface CloudflareAnswers {
  accountId: string;
  apiToken: string;
}

export interface VpsAnswers {
  host: string;
  port: string;
  user: string;
  sshKey: string;
  deployDir: string;
  pm2AppName: string;
  appPort: string;
  caddyDomain: string;
}

export type TargetDirectoryAction = "reset" | "overwrite";

export async function collectAnswers(projectNameArg: string | undefined, options: CliOptions): Promise<StorefrontAnswers> {
  const projectName = projectNameArg ?? await input({
    message: "Where should we create your Carto storefront?",
    default: "my-carto-storefront",
    validate: validateProjectName
  });
  const cleanProjectName = projectName.trim();
  const targetDirectoryAction = await collectTargetDirectoryAction(cleanProjectName, options);

  const template = options.template ?? (options.yes ? "single-product" : await select<StorefrontTemplate>({
    message: "Choose a starter template",
    default: "single-product",
    choices: [
      { name: "Single product - one domain for one product", value: "single-product" },
      { name: "Multi product - catalog storefront with categories, tags, and checkout", value: "multi-product" }
    ]
  }));

  const frontendMode = template === "multi-product"
    ? "ssr"
    : options.mode ?? (options.yes ? "ssr" : await select<FrontendMode>({
    message: "How should the frontend render?",
    default: "ssr",
    choices: [
      { name: "SSR - server-rendered storefront, can use EMS server token", value: "ssr" },
      { name: "Static - prebuilt pages, public API only", value: "static" }
    ]
  }));

  const siteDomain = await collectSiteDomain(template, cleanProjectName, options);
  const commerceApiToken = await collectCommerceApiToken(template, options);
  const commerceApiBaseUrl = await resolveCommerceApiBaseUrl(options.commerceApiBaseUrl);

  const defaultDeployTarget = template === "multi-product" ? "cloudflare-workers" : "vps";
  const deploymentChoices = template === "multi-product"
    ? [
      { name: "Cloudflare - generate Wrangler config and deploy script", value: "cloudflare-workers" as const },
      { name: "VPS - generate npm run deploy with PM2 and Caddy bootstrap", value: "vps" as const },
      { name: "None - local project only", value: "none" as const }
    ]
    : [
      { name: "VPS - generate npm run deploy with PM2 and Caddy bootstrap", value: "vps" as const },
      { name: "None - local project only", value: "none" as const }
    ];
  const deploymentTarget = options.deploy ?? (options.yes ? defaultDeployTarget : await select<DeploymentTarget>({
    message: "Where do you want to deploy?",
    default: defaultDeployTarget,
    choices: deploymentChoices
  }));
  if (template === "single-product" && deploymentTarget === "cloudflare-workers") {
    throw new Error("Cloudflare deploy is not available for the single-product template yet.");
  }

  const cloudflare = deploymentTarget === "cloudflare-workers" && !options.yes
    ? await collectCloudflareAnswers(options)
    : defaultCloudflareAnswers(options);
  const vps = deploymentTarget === "vps" && !options.yes
    ? await collectVpsAnswers(siteDomain.trim())
    : defaultVpsAnswers(siteDomain.trim());

  return {
    projectName: cleanProjectName,
    targetDirectoryAction,
    template,
    commerceApiToken,
    commerceApiBaseUrl,
    siteDomain: siteDomain.trim(),
    frontendMode,
    deploymentTarget,
    cloudflare,
    vps
  };
}

async function collectSiteDomain(
  template: StorefrontTemplate,
  projectName: string,
  options: CliOptions
): Promise<string> {
  if (options.site !== undefined) {
    return options.site.trim();
  }
  if (template === "multi-product") {
    return inferDomainFromProjectName(projectName);
  }
  if (options.yes) {
    return "example.com";
  }

  return await input({
    message: "EMS site domain",
    default: "example.com",
    validate: validateDomain
  });
}

async function collectCommerceApiToken(
  template: StorefrontTemplate,
  options: CliOptions
): Promise<string> {
  if (options.token !== undefined) {
    return options.token.trim();
  }
  if (options.yes || template !== "multi-product") {
    return "";
  }

  return await password({
    message: "EMS commerce API token",
    mask: "*",
    validate: (value) => {
      const token = value.trim();
      if (!token) return "EMS commerce API token is required for this template.";
      if (/[\r\n]/.test(token)) return "EMS commerce API token must be a single line.";
      return true;
    }
  });
}

async function collectCloudflareAnswers(options: CliOptions): Promise<CloudflareAnswers> {
  const accountId = options.cloudflareAccountId ?? await input({
    message: "Cloudflare account ID",
    default: "",
    validate: validateRequiredSingleLine("Cloudflare account ID")
  });
  const apiToken = options.cloudflareApiToken ?? await password({
    message: "Cloudflare API token",
    mask: "*",
    validate: validateRequiredSingleLine("Cloudflare API token")
  });

  return {
    accountId: accountId.trim(),
    apiToken: apiToken.trim()
  };
}

function validateRequiredSingleLine(label: string): (value: string) => true | string {
  return (value) => {
    const trimmed = value.trim();
    if (!trimmed) return `${label} is required.`;
    if (/[\r\n]/.test(trimmed)) return `${label} must be a single line.`;
    return true;
  };
}

async function collectTargetDirectoryAction(
  projectName: string,
  options: CliOptions
): Promise<TargetDirectoryAction | undefined> {
  const status = await inspectTargetDirectory(resolve(process.cwd(), projectName));
  if (status.kind === "missing" || status.kind === "empty") return undefined;
  if (status.kind === "not-directory") {
    throw new Error(`${status.path} exists and is not a directory.`);
  }
  if (options.yes) {
    throw new Error(`${status.path} already exists and is not empty.`);
  }

  return await select<TargetDirectoryAction>({
    message: `${status.path} already exists and is not empty. How should we continue?`,
    choices: [
      { name: "Reset - delete existing contents and create a fresh storefront", value: "reset" },
      { name: "Overwrite - replace matching template files and keep extra files", value: "overwrite" }
    ]
  });
}

async function collectVpsAnswers(siteDomain: string): Promise<VpsAnswers> {
  const host = await input({
    message: "VPS host",
    default: "",
    validate: validateRequiredSingleLine("VPS host")
  });
  const port = await input({
    message: "VPS SSH port",
    default: "22",
    validate: (value) => /^\d+$/.test(value.trim()) ? true : "SSH port must be a number."
  });
  const user = await input({
    message: "VPS SSH user",
    default: "ubuntu",
    validate: validateRequiredSingleLine("VPS SSH user")
  });
  const sshKey = await input({ message: "SSH private key path (optional; leave blank to use SSH password or agent auth)", default: "" });
  const deployDir = await input({
    message: "Remote deploy directory",
    default: "/var/www/carto",
    validate: validateRequiredSingleLine("Remote deploy directory")
  });
  const pm2AppName = await input({
    message: "PM2 app name",
    default: "carto",
    validate: validateRequiredSingleLine("PM2 app name")
  });
  const appPort = await input({
    message: "Project startup port for PM2",
    default: "4321",
    validate: validatePort("Project startup port")
  });
  const caddyDomain = await input({
    message: "Caddy domain(s), comma-separated",
    default: siteDomain,
    validate: validateCaddyDomains
  });

  return {
    host: host.trim(),
    port: port.trim(),
    user: user.trim(),
    sshKey: sshKey.trim(),
    deployDir: deployDir.trim(),
    pm2AppName: pm2AppName.trim(),
    appPort: appPort.trim(),
    caddyDomain: caddyDomain.trim()
  };
}

function defaultVpsAnswers(siteDomain: string): VpsAnswers {
  return {
    host: siteDomain,
    port: "22",
    user: "ubuntu",
    sshKey: "",
    deployDir: "/var/www/carto",
    pm2AppName: "carto",
    appPort: "4321",
    caddyDomain: siteDomain
  };
}

function validatePort(label: string): (value: string) => true | string {
  return (value) => {
    const port = value.trim();
    if (!/^\d+$/.test(port)) return `${label} must be a number.`;
    const parsed = Number(port);
    if (parsed < 1 || parsed > 65535) return `${label} must be between 1 and 65535.`;
    return true;
  };
}

function defaultCloudflareAnswers(options: CliOptions): CloudflareAnswers {
  return {
    accountId: options.cloudflareAccountId?.trim() ?? "",
    apiToken: options.cloudflareApiToken?.trim() ?? ""
  };
}

function inferDomainFromProjectName(projectName: string): string {
  return projectName
    .trim()
    .replace(/^@/, "")
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "example.com";
}
