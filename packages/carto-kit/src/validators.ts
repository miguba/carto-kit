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
