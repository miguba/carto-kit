import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { CartoError, type CartoErrorCode } from "./errors.js";
import { readPrivateToken } from "./secrets.js";

export const CONTRACT_BUNDLE_SCHEMA_VERSION = "1.0.0";
export const CONTRACT_BUNDLE_PATH = ".carto/contracts/bundle.json";
const CONTRACT_METADATA_PATH = ".carto/contracts/metadata.json";

export interface ContractBundle {
  schemaVersion: string;
  contractVersion: string;
  bundle: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PullContractOptions {
  offline?: boolean;
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface PullContractResult {
  ok: true;
  command: "contract pull";
  source: "remote" | "cache";
  path: string;
  schemaVersion: string;
  contractVersion: string;
}

export class ContractError extends CartoError {
  constructor(code: CartoErrorCode, message: string, options: number | { retryable?: boolean; details?: Record<string, unknown> } = {}) {
    super(code, message, typeof options === "number" ? {} : options);
  }
}

export async function pullContractBundle(projectDir: string, options: PullContractOptions = {}): Promise<PullContractResult> {
  const outputPath = resolve(projectDir, CONTRACT_BUNDLE_PATH);
  if (options.offline) {
    const cached = await readCachedBundle(outputPath);
    return result("cache", outputPath, cached);
  }

  const endpoint = options.endpoint?.trim();
  if (!endpoint) {
    throw new ContractError(
      "CAPABILITY_UNAVAILABLE",
      "Carto Private has not provided a Contract Bundle endpoint. Set CARTO_CONTRACT_BUNDLE_URL to its documented public, versioned HTTPS endpoint.",
      { retryable: false }
    );
  }
  assertVersionedHttpsEndpoint(endpoint);
  const token = await readPrivateToken(projectDir);
  if (!token) throw new ContractError("AUTH_REQUIRED", "Run carto connect before pulling the Contract Bundle.");

  const headers: Record<string, string> = { accept: "application/json", authorization: `Bearer ${token}` };
  const metadataPath = resolve(projectDir, CONTRACT_METADATA_PATH);
  const etag = await readCachedEtag(metadataPath);
  if (etag) headers["if-none-match"] = etag;
  let response: Response;
  try {
    response = await requestWithRetry(options.fetch ?? globalThis.fetch, endpoint, headers, options.sleep ?? delay);
  } catch (error) {
    if (error instanceof ContractError) throw error;
    const cached = await tryReadCachedBundle(outputPath);
    if (cached) return result("cache", outputPath, cached);
    throw new ContractError("NETWORK_ERROR", `Contract Bundle request failed: ${safeError(error)}`, { retryable: true });
  }
  if (response.status === 304) return result("cache", outputPath, await readCachedBundle(outputPath));
  const requestId = response.headers.get("x-request-id") ?? undefined;
  if (response.status === 401) throw new ContractError("AUTH_REQUIRED", "The Carto credential is expired or revoked. Run carto connect --reauth.", { details: requestId ? { requestId } : undefined });
  if (response.status === 403) throw new ContractError("AUTH_FORBIDDEN", "The Carto credential cannot read the Contract Bundle.", { details: requestId ? { requestId } : undefined });
  if (response.status === 429) throw new ContractError("RATE_LIMITED", "Carto Private rate limiting persisted after bounded retries.", { retryable: true, details: { ...(requestId ? { requestId } : {}), retryAfter: response.headers.get("retry-after") } });
  if (!response.ok) {
    const cached = response.status >= 500 ? await tryReadCachedBundle(outputPath) : undefined;
    if (cached) return result("cache", outputPath, cached);
    throw new ContractError("NETWORK_ERROR", `Contract Bundle endpoint returned HTTP ${response.status}.`, { retryable: response.status >= 500, details: requestId ? { requestId } : undefined });
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new ContractError("INVALID_BUNDLE", "Contract Bundle endpoint returned invalid JSON.", 4);
  }
  const bundle = validateContractBundle(value);
  await atomicWriteJson(outputPath, bundle);
  const responseEtag = response.headers.get("etag");
  if (responseEtag) await atomicWriteJson(metadataPath, { schemaVersion: 1, etag: responseEtag });
  return result("remote", outputPath, bundle);
}

async function requestWithRetry(fetcher: typeof globalThis.fetch, endpoint: string, headers: Record<string, string>, sleep: (milliseconds: number) => Promise<void>): Promise<Response> {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetcher(endpoint, { headers });
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt === 2) return response;
    const retryAfter = Number(response.headers.get("retry-after"));
    const milliseconds = Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
    await sleep(Math.min(milliseconds, 5000));
  }
  return response!;
}

async function readCachedEtag(path: string): Promise<string | undefined> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as { schemaVersion?: unknown; etag?: unknown };
    return value.schemaVersion === 1 && typeof value.etag === "string" ? value.etag : undefined;
  } catch { return undefined; }
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

export function validateContractBundle(value: unknown): ContractBundle {
  if (!isRecord(value)) throw new ContractError("INVALID_BUNDLE", "Contract Bundle must be a JSON object.", 4);
  if (typeof value.schemaVersion !== "string") throw new ContractError("INVALID_BUNDLE", "Contract Bundle is missing string schemaVersion.", 4);
  const major = semverMajor(value.schemaVersion);
  if (major === undefined) throw new ContractError("INVALID_BUNDLE", "Contract Bundle schemaVersion must be semantic versioning.", 4);
  if (major !== 1) {
    throw new ContractError(
      "UNSUPPORTED_SCHEMA_VERSION",
      `Unsupported Contract Bundle schemaVersion ${value.schemaVersion}; this CLI supports compatible 1.x additive changes.`,
      4
    );
  }
  if (typeof value.contractVersion !== "string" || semverMajor(value.contractVersion) === undefined) {
    throw new ContractError("INVALID_BUNDLE", "Contract Bundle contractVersion must be semantic versioning.", 4);
  }
  if (!isRecord(value.bundle)) throw new ContractError("INVALID_BUNDLE", "Contract Bundle bundle must be a JSON object.", 4);
  return value as ContractBundle;
}

function assertVersionedHttpsEndpoint(endpoint: string): void {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new ContractError("CAPABILITY_UNAVAILABLE", "CARTO_CONTRACT_BUNDLE_URL must be an absolute URL.", 2); }
  const localDevelopmentHost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  const safeProtocol = url.protocol === "https:" || (url.protocol === "http:" && localDevelopmentHost);
  if (!safeProtocol || !/(?:^|\/)v\d+(?:\/|$)/i.test(url.pathname)) {
    throw new ContractError("CAPABILITY_UNAVAILABLE", "CARTO_CONTRACT_BUNDLE_URL must be a documented HTTPS endpoint with a version segment such as /v1/; HTTP is allowed only for loopback development.", 2);
  }
}

async function readCachedBundle(path: string): Promise<ContractBundle> {
  try {
    return validateContractBundle(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error instanceof ContractError) throw new ContractError("CACHE_UNAVAILABLE", `Cached Contract Bundle is unusable: ${error.message}`, 4);
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ContractError("CACHE_UNAVAILABLE", "No cached Contract Bundle is available for offline use.", 4);
    if (error instanceof SyntaxError) throw new ContractError("CACHE_UNAVAILABLE", "Cached Contract Bundle contains invalid JSON.", 4);
    throw new ContractError("FILESYSTEM_ERROR", `Unable to read cached Contract Bundle: ${safeError(error)}`, 5);
  }
}

async function tryReadCachedBundle(path: string): Promise<ContractBundle | undefined> {
  try { return await readCachedBundle(path); } catch { return undefined; }
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true });
    const handle = await open(tempPath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally { await handle.close(); }
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw new ContractError("FILESYSTEM_ERROR", `Unable to write Contract Bundle atomically: ${safeError(error)}`, 5);
  }
}

function result(source: "remote" | "cache", path: string, bundle: ContractBundle): PullContractResult {
  return { ok: true, command: "contract pull", source, path, schemaVersion: bundle.schemaVersion, contractVersion: bundle.contractVersion };
}

function semverMajor(value: string): number | undefined {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(value);
  return match ? Number(match[1]) : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function safeError(error: unknown): string { return error instanceof Error ? error.message : String(error); }
