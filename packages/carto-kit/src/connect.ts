import { spawn } from "node:child_process";
import { CartoError } from "./errors.js";
import type { CommandOutput } from "./output.js";
import { hasPrivateToken, savePrivateToken } from "./secrets.js";

interface DeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
}

type PollResult =
  | { status: "pending" | "slow_down" }
  | { status: "approved"; token: string }
  | { status: "denied" | "expired" };

export interface ConnectOptions {
  reauth?: boolean;
  timeoutSeconds?: number;
  noBrowser?: boolean;
  signal?: AbortSignal;
  apiUrl?: string;
  fetch?: typeof globalThis.fetch;
  openBrowser?: (url: string) => Promise<void>;
  output: CommandOutput;
}

export async function connectPrivate(projectDir: string, options: ConnectOptions): Promise<Record<string, unknown>> {
  if (!options.reauth && await hasPrivateToken(projectDir)) {
    return { status: "connected", changed: false, credential: "stored" };
  }
  if (!process.stdin.isTTY && !options.output.json && !options.noBrowser) {
    throw new CartoError("NO_TTY", "A non-interactive session must use --no-browser or --json.");
  }
  const apiUrl = options.apiUrl ?? process.env.CARTO_PRIVATE_API_URL;
  if (!apiUrl) throw new CartoError("CONFIG_INVALID", "CARTO_PRIVATE_API_URL is required until Carto Private publishes its production endpoint.");
  const fetcher = options.fetch ?? globalThis.fetch;
  const start = await request<DeviceStart>(fetcher, new URL("/api/cli/device-authorizations", apiUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  }, options.signal);
  validateStart(start);
  const verificationUrl = start.verificationUriComplete ?? start.verificationUri;
  options.output.diagnostic(`Open ${verificationUrl} and enter code ${start.userCode}.`);
  if (!options.noBrowser) {
    try { await (options.openBrowser ?? openBrowser)(verificationUrl); }
    catch { options.output.diagnostic("The browser could not be opened automatically; use the URL above."); }
  }

  const serviceDeadline = Date.now() + start.expiresIn * 1000;
  const userDeadline = Date.now() + (options.timeoutSeconds ?? start.expiresIn) * 1000;
  const effectiveDeadline = Math.min(serviceDeadline, userDeadline);
  const deadlineController = new AbortController();
  const deadlineTimer = setTimeout(() => deadlineController.abort(), Math.max(0, effectiveDeadline - Date.now()));
  const flowSignal = options.signal
    ? AbortSignal.any([options.signal, deadlineController.signal])
    : deadlineController.signal;
  let interval = Math.max(1, start.interval) * 1000;
  try {
    while (Date.now() < effectiveDeadline) {
      await delay(Math.min(interval, Math.max(1, effectiveDeadline - Date.now())), flowSignal);
      const result = await request<PollResult>(fetcher, new URL("/api/cli/device-authorizations/token", apiUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceCode: start.deviceCode })
      }, flowSignal);
      if (result.status === "approved") {
        if (!result.token) throw new CartoError("SERVICE_ERROR", "Carto Private returned an invalid authorization response.");
        await savePrivateToken(projectDir, result.token);
        return { status: "connected", changed: true, credential: "stored" };
      }
      if (result.status === "denied") throw new CartoError("AUTH_CANCELLED", "Authorization was cancelled.");
      if (result.status === "expired") throw new CartoError("AUTH_EXPIRED", "Authorization expired; run carto connect again.");
      if (result.status === "slow_down") interval += 1000;
    }
  } catch (error) {
    if (!deadlineController.signal.aborted) throw error;
  } finally {
    clearTimeout(deadlineTimer);
  }
  if (Date.now() >= serviceDeadline) throw new CartoError("AUTH_EXPIRED", "Authorization expired; run carto connect again.");
  throw new CartoError("AUTH_TIMEOUT", "Authorization timed out; run carto connect again.", { retryable: true });
}

async function request<T>(fetcher: typeof globalThis.fetch, url: URL, init: RequestInit, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try { response = await fetcher(url, { ...init, signal }); }
  catch (error) {
    if (signal?.aborted) throw new CartoError("AUTH_CANCELLED", "Authorization was cancelled.");
    throw new CartoError("NETWORK_ERROR", "Could not reach Carto Private.", { retryable: true, cause: error });
  }
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    throw new CartoError("SERVICE_ERROR", `Carto Private returned HTTP ${response.status}.`, {
      retryable: response.status === 429 || response.status >= 500,
      details: requestId ? { requestId } : undefined
    });
  }
  try { return await response.json() as T; }
  catch (error) { throw new CartoError("SERVICE_ERROR", "Carto Private returned an invalid response.", { cause: error }); }
}

function validateStart(value: DeviceStart): void {
  if (!value.deviceCode || !value.userCode || !value.verificationUri || !Number.isFinite(value.expiresIn) || !Number.isFinite(value.interval)) {
    throw new CartoError("SERVICE_ERROR", "Carto Private returned an invalid authorization response.");
  }
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new CartoError("AUTH_CANCELLED", "Authorization was cancelled."));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function openBrowser(url: string): Promise<void> {
  const [command, args] = process.platform === "darwin"
    ? ["open", [url]]
    : process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : ["xdg-open", [url]];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}
