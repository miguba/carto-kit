import { access, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

export const deploymentTargets = ["none", "vps", "cloudflare-workers"] as const;
export const templates = ["single-product", "multi-product"] as const;

export type DeploymentTarget = (typeof deploymentTargets)[number];
export type StorefrontTemplate = (typeof templates)[number];
export type TargetDirectoryStatus =
  | { kind: "missing"; path: string }
  | { kind: "empty"; path: string }
  | { kind: "non-empty"; path: string; entries: string[] }
  | { kind: "not-directory"; path: string };

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

export function validateDomain(value: string): true | string {
  const domain = value.trim();
  if (!domain) return "Site domain is required.";
  if (domain.includes("://")) return "Use a domain such as example.com, not a URL.";
  if (!/^[a-zA-Z0-9.-]+(:\d+)?$/.test(domain)) return "Site domain contains invalid characters.";
  return true;
}

export function validateHttpBaseUrl(value: string): true | string {
  const url = value.trim();
  if (!url) return "Commerce API base URL is required.";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "Commerce API base URL must start with http:// or https://.";
    }
    if (parsed.search || parsed.hash) {
      return "Commerce API base URL must not include a query string or hash.";
    }
    return true;
  } catch {
    return "Commerce API base URL must be a valid URL.";
  }
}

export function normalizeHttpBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function validateCaddyDomains(value: string): true | string {
  const domains = value
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean);
  if (domains.length === 0) return "Caddy domain is required.";
  for (const domain of domains) {
    if (domain.includes("://")) return "Use domains such as example.com, www.example.com, not URLs.";
    if (!/^[a-zA-Z0-9.-]+(:\d+)?$/.test(domain)) return `Caddy domain "${domain}" contains invalid characters.`;
  }
  return true;
}

export async function validateTargetDirectory(path: string): Promise<void> {
  const status = await inspectTargetDirectory(path);
  if (status.kind === "not-directory") {
    throw new Error(`${status.path} exists and is not a directory.`);
  }
  if (status.kind === "non-empty") {
    throw new Error(`${status.path} already exists and is not empty.`);
  }
}

export async function inspectTargetDirectory(path: string): Promise<TargetDirectoryStatus> {
  const target = resolve(path);
  try {
    const info = await stat(target);
    if (!info.isDirectory()) {
      return { kind: "not-directory", path: target };
    }
    const entries = await readdir(target);
    const visibleEntries = entries.filter((entry) => entry !== ".DS_Store");
    if (visibleEntries.length > 0) {
      return { kind: "non-empty", path: target, entries: visibleEntries.sort() };
    }
    return { kind: "empty", path: target };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "missing", path: target };
    }
    throw error;
  }
}

export async function assertCanRead(path: string): Promise<void> {
  await access(path);
}
