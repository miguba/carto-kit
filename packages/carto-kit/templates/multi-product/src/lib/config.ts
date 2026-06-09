import {
  PUBLIC_MAPBOX_ACCESS_TOKEN,
} from "astro:env/client";

const COMMERCE_API_BASE_URL = "__EMS_API_BASE_URL__";
const TEMPLATE_COMMERCE_API_PLACEHOLDER = [
  "__EMS",
  "API",
  "BASE",
  "URL__",
].join("_");

export type CommerceMediaConfig = {
  cdnBaseUrl?: string | null;
};

let commerceMediaConfig: CommerceMediaConfig = {};

export function getCommerceConfig() {
  return {
    apiBaseUrl: resolveCommerceApiBaseUrl(),
    cdnBaseUrl: normalizeBaseUrl(commerceMediaConfig.cdnBaseUrl),
    mapboxAccessToken: normalizeOptionalToken(PUBLIC_MAPBOX_ACCESS_TOKEN),
  };
}

export function setCommerceMediaConfig(config: CommerceMediaConfig | undefined) {
  commerceMediaConfig = {
    cdnBaseUrl: normalizeBaseUrl(config?.cdnBaseUrl),
  };
}

function normalizeBaseUrl(url: string | null | undefined) {
  return (url ?? "").replace(/\/+$/, "");
}

function resolveCommerceApiBaseUrl() {
  const scaffoldedBaseUrl = normalizeBaseUrl(COMMERCE_API_BASE_URL);
  if (
    scaffoldedBaseUrl &&
    scaffoldedBaseUrl !== TEMPLATE_COMMERCE_API_PLACEHOLDER
  ) {
    return scaffoldedBaseUrl;
  }

  const developmentBaseUrl = normalizeBaseUrl(
    import.meta.env.PUBLIC_COMMERCE_API_BASE_URL,
  );
  if (developmentBaseUrl) {
    return developmentBaseUrl;
  }

  throw new Error(
    "Missing commerce API base URL. Set PUBLIC_COMMERCE_API_BASE_URL in .env when developing the template directly.",
  );
}

function normalizeOptionalToken(value: string | undefined) {
  if (!value || value.startsWith("replace-with-")) {
    return "";
  }

  return value;
}
