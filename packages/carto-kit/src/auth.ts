import { safeError } from "./security.js";

export interface DeviceAuthorization { deviceCode: string; userCode: string; verificationUri: string; expiresIn: number; interval: number }
export interface ConnectCredential { apiBaseUrl: string; token: string; site: string; serverApp: { id: string; name: string; scopes: string[] } }
export type FetchLike = typeof fetch;

export async function beginDeviceAuthorization(baseUrl: string, projectName: string, fetcher: FetchLike = fetch): Promise<DeviceAuthorization> {
  const response = await fetcher(`${baseUrl}/api/cli/device-authorizations`, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client: "carto-kit", projectName, requestedScopes: ["commerce:read", "commerce:write"] })
  });
  if (!response.ok) throw await responseError(response, "Carto Private does not support CLI device authorization yet");
  const value = await response.json() as Partial<DeviceAuthorization>;
  if (!value.deviceCode || !value.userCode || !value.verificationUri || !value.expiresIn || !value.interval) throw new Error("Carto returned an invalid device authorization response.");
  return value as DeviceAuthorization;
}

export async function pollDeviceAuthorization(baseUrl: string, auth: DeviceAuthorization, options: { fetcher?: FetchLike; sleep?: (ms: number) => Promise<void>; now?: () => number } = {}): Promise<ConnectCredential> {
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + auth.expiresIn * 1000;
  let interval = auth.interval;
  while (now() < deadline) {
    await sleep(interval * 1000);
    const response = await fetcher(`${baseUrl}/api/cli/device-authorizations/token`, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ deviceCode: auth.deviceCode })
    });
    if (response.status === 202) {
      const pending = await response.json().catch(() => ({})) as { status?: string };
      if (pending.status === "slow_down") interval += 5;
      continue;
    }
    if (!response.ok) throw await responseError(response, "Device authorization failed");
    const value = await response.json() as Partial<ConnectCredential>;
    if (!value.apiBaseUrl || !value.token || !value.site || !value.serverApp) throw new Error("Carto returned an invalid one-time credential response.");
    if (/\r|\n/.test(value.token) || !Array.isArray(value.serverApp.scopes)) throw new Error("Carto returned an invalid one-time credential response.");
    try {
      const apiUrl = new URL(value.apiBaseUrl);
      if (!(["http:", "https:"] as string[]).includes(apiUrl.protocol) || apiUrl.search || apiUrl.hash) throw new Error();
    } catch { throw new Error("Carto returned an invalid Commerce API base URL."); }
    return value as ConnectCredential;
  }
  throw new Error("Device authorization expired. Run carto connect again.");
}

export async function verifyCommerceApi(apiBaseUrl: string, token: string, fetcher: FetchLike = fetch): Promise<void> {
  let response: Response;
  try { response = await fetcher(`${apiBaseUrl.replace(/\/+$/, "")}/api/commerce/config`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } }); }
  catch (error) { throw safeError(error); }
  if (!response.ok) throw await responseError(response, `Commerce API connectivity check failed (${response.status})`);
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.text().catch(() => "");
  return safeError(body ? `${fallback}: HTTP ${response.status}: ${body.slice(0, 500)}` : `${fallback}: HTTP ${response.status}`);
}
