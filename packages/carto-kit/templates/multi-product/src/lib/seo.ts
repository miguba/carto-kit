/**
 * Shared SEO helpers used across pages and the sitemap generator.
 */

/**
 * Resolve a relative path to an absolute URL using the configured domain or
 * the current request origin as a fallback.
 */
export function siteAbsoluteUrl(
  path: string,
  domain: string,
  fallbackOrigin: string,
) {
  if (!path) {
    return "";
  }

  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const origin = domain
    ? /^https?:\/\//.test(domain)
      ? domain.replace(/\/+$/, "")
      : `https://${domain.replace(/\/+$/, "")}`
    : fallbackOrigin.replace(/\/+$/, "");

  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
