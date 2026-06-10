#!/usr/bin/env node
import { parseArgs } from "node:util";
import { basename, relative } from "node:path";
import kleur from "kleur";
import { collectAnswers, type CliOptions } from "./prompts.js";
import { scaffoldStorefront } from "./scaffold.js";
import {
  deploymentTargets,
  templates,
  validateDomain,
  validateHttpBaseUrl,
  validateProjectName
} from "./validators.js";
import {
  configFields,
  deleteUserConfigValue,
  getConfigField,
  getConfigPath,
  parseConfigKey,
  readUserConfig,
  setUserConfigValue
} from "./user-config.js";

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      site: { type: "string" },
      token: { type: "string" },
      "api-base-url": { type: "string" },
      "cloudflare-account-id": { type: "string" },
      "cloudflare-api-token": { type: "string" },
      "cloudflare-kv-namespace-id": { type: "string" },
      "page-cache-dir": { type: "string" },
      "page-cache-prefix": { type: "string" },
      template: { type: "string" },
      deploy: { type: "string" },
      yes: { type: "boolean", short: "y" },
      help: { type: "boolean", short: "h" }
    }
  });

  if (values.help) {
    printHelp();
    return;
  }

  if (positionals[0] === "config") {
    await handleConfigCommand(positionals.slice(1));
    return;
  }

  const createPositionals = positionals[0] === "create" ? positionals.slice(1) : positionals;
  const projectName = createPositionals[0];
  if (projectName) assertValidation(validateProjectName(projectName));

  const options = parseOptions(values);
  if (options.site) assertValidation(validateDomain(options.site));
  if (options.commerceApiBaseUrl) assertValidation(validateHttpBaseUrl(options.commerceApiBaseUrl));

  if (!options.yes) {
    console.log("");
    console.log(kleur.bold("carto"));
    console.log("Create a self-hosted EMS storefront.");
    console.log("");
  }

  const answers = await collectAnswers(projectName, options);
  const result = await scaffoldStorefront(answers);

  const projectPath = relative(process.cwd(), result.projectDir) || basename(result.projectDir);
  const pm = result.packageManager;
  const run = pm === "npm" ? "npm run" : pm;

  console.log("");
  console.log(kleur.green("Carto storefront created."));
  console.log("");
  console.log(kleur.bold("Next steps:"));
  console.log(`  cd ${projectPath}`);
  console.log(`  ${pm} install`);
  console.log(`  ${run} dev`);
  if (answers.deploymentTarget === "vps") {
    console.log(`  ${run} deploy`);
  }
  if (answers.deploymentTarget === "cloudflare-workers") {
    console.log(`  ${run} deploy`);
  }
  printCacheConfigurationSteps(answers.deploymentTarget);
  console.log("");
  console.log("Secrets were written to .env and were not printed.");
}

function printCacheConfigurationSteps(deploymentTarget: CliOptions["deploy"]): void {
  if (deploymentTarget === "cloudflare-workers") {
    console.log("");
    console.log(kleur.bold("Cache configuration:"));
    console.log("  Create a Cloudflare Workers KV namespace for persistent page-data cache.");
    console.log("  Set CLOUDFLARE_KV_NAMESPACE_ID in .env before running deploy.");
    console.log("  Keep PAGE_CACHE_PREFIX unique per project when sharing one KV namespace.");
    console.log("  The deploy script binds that namespace as KV_STORE.");
    return;
  }

  if (deploymentTarget === "vps") {
    console.log("");
    console.log(kleur.bold("Cache configuration:"));
    console.log("  Page-data cache is stored under ./.cache by default.");
    console.log("  Set PAGE_CACHE_DIR in .env if you want to store the cache somewhere else.");
  }
}

function parseOptions(values: Record<string, string | boolean | undefined>): CliOptions {
  const options: CliOptions = {
    site: typeof values.site === "string" ? values.site : undefined,
    token: typeof values.token === "string" ? values.token : undefined,
    commerceApiBaseUrl: typeof values["api-base-url"] === "string" ? values["api-base-url"] : undefined,
    cloudflareAccountId: typeof values["cloudflare-account-id"] === "string" ? values["cloudflare-account-id"] : undefined,
    cloudflareApiToken: typeof values["cloudflare-api-token"] === "string" ? values["cloudflare-api-token"] : undefined,
    cloudflareKvNamespaceId:
      typeof values["cloudflare-kv-namespace-id"] === "string" ? values["cloudflare-kv-namespace-id"] : undefined,
    pageCacheDir: typeof values["page-cache-dir"] === "string" ? values["page-cache-dir"] : undefined,
    pageCachePrefix: typeof values["page-cache-prefix"] === "string" ? values["page-cache-prefix"] : undefined,
    yes: values.yes === true
  };

  if (typeof values.template === "string") {
    if (!templates.includes(values.template as never)) {
      throw new Error(`Unknown template "${values.template}".`);
    }
    options.template = values.template as CliOptions["template"];
  }

  if (typeof values.deploy === "string") {
    if (!deploymentTargets.includes(values.deploy as never)) {
      throw new Error(`Unknown deployment target "${values.deploy}".`);
    }
    options.deploy = values.deploy as CliOptions["deploy"];
  }

  return options;
}

async function handleConfigCommand(positionals: string[]): Promise<void> {
  const [action, key, ...valueParts] = positionals;

  if (!action || action === "list" || action === "ls") {
    await printConfigList();
    return;
  }

  if (action === "keys") {
    printConfigKeys();
    return;
  }

  if (action === "get") {
    if (!key) {
      await printConfigList();
      return;
    }
    const configKey = requireConfigKey(key);
    const config = await readUserConfig();
    console.log(config[configKey] ?? getConfigField(configKey).defaultValue);
    return;
  }

  if (action === "set") {
    const configKey = requireConfigKey(key);
    const value = valueParts.join(" ").trim();
    if (!value) throw new Error(`Missing value for config key "${key}".`);
    const normalized = await setUserConfigValue(configKey, value);
    console.log(`${configKey}=${normalized}`);
    return;
  }

  if (action === "delete" || action === "unset") {
    const configKey = requireConfigKey(key);
    await deleteUserConfigValue(configKey);
    console.log(`Deleted ${configKey}.`);
    return;
  }

  throw new Error(`Unknown config command "${action}".`);
}

async function printConfigList(): Promise<void> {
  const config = await readUserConfig();
  for (const field of configFields) {
    const configuredValue = config[field.key];
    const value = configuredValue ?? field.defaultValue;
    const source = configuredValue === undefined ? "default" : "user";
    console.log(`${field.key}=${value} (${source})`);
  }
  console.log(`configPath=${getConfigPath()}`);
}

function printConfigKeys(): void {
  for (const field of configFields) {
    console.log(`${field.key}`);
    console.log(`  default: ${field.defaultValue}`);
    console.log(`  ${field.description}`);
    if (field.aliases.length > 0) {
      console.log(`  aliases: ${field.aliases.join(", ")}`);
    }
  }
}

function requireConfigKey(key: string | undefined): "commerceApiBaseUrl" {
  if (!key) {
    throw new Error(`Missing config key. Supported keys: ${configFields.map((field) => field.key).join(", ")}.`);
  }
  const configKey = parseConfigKey(key);
  if (!configKey) {
    throw new Error(`Unknown config key "${key}". Supported keys: ${configFields.map((field) => field.key).join(", ")}.`);
  }
  return configKey;
}

function assertValidation(result: true | string): void {
  if (result !== true) throw new Error(result);
}

function printHelp(): void {
  console.log(`carto

Usage:
  npm create carto@latest
  carto-kit create my-storefront --site example.com
  carto create my-storefront --site example.com
  carto config set commerceApiBaseUrl https://ems.example.com

Options:
  --site <domain>      Optional deployment domain for generated site URLs and VPS Caddy defaults
  --token <token>      EMS commerce API token, written to .env
  --api-base-url <url> Commerce API base URL for this generated storefront
  --cloudflare-account-id <id>
                       Cloudflare account ID for Cloudflare deploys
  --cloudflare-api-token <token>
                       Cloudflare API token for Cloudflare deploys
  --cloudflare-kv-namespace-id <id>
                       Optional Workers KV namespace ID for persistent page-data cache
  --page-cache-dir <path>
                       Optional VPS page cache directory, defaults to ./.cache
  --page-cache-prefix <prefix>
                       Cache key prefix for sharing one KV namespace across projects
  --template <name>    Template ID: ${templates.join(", ")}
  --deploy <target>    Deployment target: ${deploymentTargets.join(", ")}
  -y, --yes            Accept defaults for optional prompts
  -h, --help           Show help

Config:
  carto config keys
  carto config list
  carto config set commerceApiBaseUrl <url>
  carto config get commerceApiBaseUrl
  carto config delete commerceApiBaseUrl
`);
}

main().catch((error: unknown) => {
  console.error(kleur.red("Carto command failed."));
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
