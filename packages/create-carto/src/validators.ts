import { access, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

export const deploymentTargets = ["none", "vps", "cloudflare-pages"] as const;
export const frontendModes = ["ssr", "static"] as const;
export const templates = ["astro-storefront", "astro-commerce-cloudflare"] as const;

export type DeploymentTarget = (typeof deploymentTargets)[number];
export type FrontendMode = (typeof frontendModes)[number];
export type StorefrontTemplate = (typeof templates)[number];

export function validateProjectName(value: string): true | string {
  const name = value.trim();
  if (!name) return "Project name is required.";
  if (name === "." || name === "..") return "Choose a normal project directory name.";
  if (/[<>:"|?*\u0000-\u001F/\\]/.test(name)) return "Project name contains invalid path characters.";
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)) {
    return "Project name must be a valid lowercase npm package name.";
  }
  return true;
}

export function validateUrl(value: string): true | string {
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) {
      return "EMS API URL must start with http:// or https://.";
    }
    return true;
  } catch {
    return "EMS API URL must be a valid URL.";
  }
}

export function validateDomain(value: string): true | string {
  const domain = value.trim();
  if (!domain) return "EMS site domain is required.";
  if (domain.includes("://")) return "Use a domain such as example.com, not a URL.";
  if (!/^[a-zA-Z0-9.-]+(:\d+)?$/.test(domain)) return "EMS site domain contains invalid characters.";
  return true;
}

export async function validateTargetDirectory(path: string): Promise<void> {
  const target = resolve(path);
  try {
    const info = await stat(target);
    if (!info.isDirectory()) {
      throw new Error(`${target} exists and is not a directory.`);
    }
    const entries = await readdir(target);
    const visibleEntries = entries.filter((entry) => entry !== ".DS_Store");
    if (visibleEntries.length > 0) {
      throw new Error(`${target} already exists and is not empty.`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

export async function assertCanRead(path: string): Promise<void> {
  await access(path);
}
