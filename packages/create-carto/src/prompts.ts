import { confirm, input, select } from "@inquirer/prompts";
import type { DeploymentTarget, FrontendMode, StorefrontTemplate } from "./validators.js";
import { validateDomain, validateProjectName, validateUrl } from "./validators.js";

export interface CliOptions {
  api?: string;
  site?: string;
  template?: StorefrontTemplate;
  mode?: FrontendMode;
  deploy?: DeploymentTarget;
  yes?: boolean;
}

export interface StorefrontAnswers {
  projectName: string;
  template: StorefrontTemplate;
  emsApiUrl: string;
  siteDomain: string;
  frontendMode: FrontendMode;
  deploymentTarget: DeploymentTarget;
  configureVps: boolean;
  vps: VpsAnswers;
}

export interface VpsAnswers {
  host: string;
  port: string;
  user: string;
  sshKey: string;
  deployDir: string;
  pm2AppName: string;
  caddyDomain: string;
}

export async function collectAnswers(projectNameArg: string | undefined, options: CliOptions): Promise<StorefrontAnswers> {
  const projectName = projectNameArg ?? await input({
    message: "Where should we create your Carto storefront?",
    default: "my-carto-storefront",
    validate: validateProjectName
  });

  const template = options.template ?? (options.yes ? "astro-storefront" : await select<StorefrontTemplate>({
    message: "Choose a starter template",
    default: "astro-storefront",
    choices: [
      { name: "Astro storefront - lightweight reference frontend, VPS deploy", value: "astro-storefront" },
      { name: "Astro commerce Cloudflare - production-style React checkout", value: "astro-commerce-cloudflare" }
    ]
  }));

  const emsApiUrl = options.api ?? (options.yes ? "https://ems.example.com" : await input({
    message: "EMS API base URL",
    default: "https://ems.example.com",
    validate: validateUrl
  }));

  const siteDomain = options.site ?? (options.yes ? "example.com" : await input({
    message: "EMS site domain",
    default: "example.com",
    validate: validateDomain
  }));

  const frontendMode = options.mode ?? (options.yes ? "ssr" : await select<FrontendMode>({
    message: "How should the frontend render?",
    default: "ssr",
    choices: [
      { name: "SSR - server-rendered storefront, can use EMS server token", value: "ssr" },
      { name: "Static - prebuilt pages, public API only", value: "static" }
    ]
  }));

  const defaultDeployTarget = template === "astro-commerce-cloudflare" ? "cloudflare-pages" : "vps";
  const deploymentTarget = options.deploy ?? (options.yes ? defaultDeployTarget : await select<DeploymentTarget>({
    message: "Where do you want to deploy?",
    default: defaultDeployTarget,
    choices: template === "astro-commerce-cloudflare" ? [
      { name: "Cloudflare - generate Wrangler deploy config", value: "cloudflare-pages" },
      { name: "None - local project only", value: "none" },
      { name: "VPS - not recommended for this Cloudflare template", value: "vps" }
    ] : [
      { name: "VPS - generate npm run deploy:vps", value: "vps" },
      { name: "None - local project only", value: "none" },
      { name: "Cloudflare - config placeholder", value: "cloudflare-pages" }
    ]
  }));

  const configureVps = deploymentTarget === "vps" && !options.yes
    ? await confirm({ message: "Configure VPS deploy values now?", default: false })
    : deploymentTarget === "vps";

  const vps = configureVps && !options.yes
    ? await collectVpsAnswers(siteDomain.trim())
    : defaultVpsAnswers(siteDomain.trim());

  return {
    projectName: projectName.trim(),
    template,
    emsApiUrl: emsApiUrl.trim().replace(/\/+$/, ""),
    siteDomain: siteDomain.trim(),
    frontendMode,
    deploymentTarget,
    configureVps,
    vps
  };
}

async function collectVpsAnswers(siteDomain: string): Promise<VpsAnswers> {
  return {
    host: await input({ message: "VPS host", default: "" }),
    port: await input({
      message: "VPS SSH port",
      default: "22",
      validate: (value) => /^\d+$/.test(value.trim()) ? true : "SSH port must be a number."
    }),
    user: await input({ message: "VPS SSH user", default: "ubuntu" }),
    sshKey: await input({ message: "SSH private key path", default: "" }),
    deployDir: await input({ message: "Remote deploy directory", default: "/var/www/carto" }),
    pm2AppName: await input({ message: "PM2 app name", default: "carto" }),
    caddyDomain: await input({
      message: "Caddy domain",
      default: siteDomain,
      validate: validateDomain
    })
  };
}

function defaultVpsAnswers(siteDomain: string): VpsAnswers {
  return {
    host: "",
    port: "22",
    user: "ubuntu",
    sshKey: "",
    deployDir: "/var/www/carto",
    pm2AppName: "carto",
    caddyDomain: siteDomain
  };
}
