import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_EMS_API_BASE_URL } from "./constants.js";
import { normalizeHttpBaseUrl, validateHttpBaseUrl } from "./validators.js";

export type ConfigKey = "commerceApiBaseUrl";

export interface UserConfig {
  commerceApiBaseUrl?: string;
}

export interface ConfigField {
  key: ConfigKey;
  aliases: string[];
  defaultValue: string;
  description: string;
}

export const configFields: ConfigField[] = [
  {
    key: "commerceApiBaseUrl",
    aliases: ["commerce-api-base-url", "api-base-url"],
    defaultValue: DEFAULT_EMS_API_BASE_URL,
    description: "Carto Storefront API base URL used when creating storefronts."
  }
];

const configKeys = new Set<ConfigKey>(configFields.map((field) => field.key));
const configKeyAliases = new Map<string, ConfigKey>(
  configFields.flatMap((field) => [
    [field.key, field.key],
    ...field.aliases.map((alias) => [alias, field.key] as const)
  ])
);

export function isConfigKey(value: string): value is ConfigKey {
  return configKeys.has(value as ConfigKey);
}

export function parseConfigKey(value: string | undefined): ConfigKey | undefined {
  if (!value) return undefined;
  return configKeyAliases.get(value);
}

export function getConfigField(key: ConfigKey): ConfigField {
  const field = configFields.find((candidate) => candidate.key === key);
  if (!field) throw new Error(`Unknown config key "${key}".`);
  return field;
}

export function getConfigPath(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
  const configRoot = xdgConfigHome || join(getHomeDirectory(), ".config");
  return join(configRoot, "carto", "config.json");
}

export async function readUserConfig(): Promise<UserConfig> {
  try {
    const parsed = JSON.parse(await readFile(getConfigPath(), "utf8")) as UserConfig;
    return {
      commerceApiBaseUrl: typeof parsed.commerceApiBaseUrl === "string"
        ? normalizeHttpBaseUrl(parsed.commerceApiBaseUrl)
        : undefined
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function writeUserConfig(config: UserConfig): Promise<void> {
  const path = getConfigPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export async function setUserConfigValue(key: ConfigKey, value: string): Promise<string> {
  if (key !== "commerceApiBaseUrl") {
    throw new Error(`Unknown config key "${key}".`);
  }
  const validation = validateHttpBaseUrl(value);
  if (validation !== true) throw new Error(validation);

  const config = await readUserConfig();
  const normalized = normalizeHttpBaseUrl(value);
  config.commerceApiBaseUrl = normalized;
  await writeUserConfig(config);
  return normalized;
}

export async function deleteUserConfigValue(key: ConfigKey): Promise<void> {
  const config = await readUserConfig();
  delete config[key];
  if (Object.keys(config).length === 0) {
    await rm(getConfigPath(), { force: true });
    return;
  }
  await writeUserConfig(config);
}

export async function resolveCommerceApiBaseUrl(override: string | undefined): Promise<string> {
  if (override !== undefined) {
    const validation = validateHttpBaseUrl(override);
    if (validation !== true) throw new Error(validation);
    return normalizeHttpBaseUrl(override);
  }

  const config = await readUserConfig();
  return config.commerceApiBaseUrl ?? DEFAULT_EMS_API_BASE_URL;
}

function getHomeDirectory(): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) throw new Error("Unable to find the user home directory for Carto config.");
  return home;
}
