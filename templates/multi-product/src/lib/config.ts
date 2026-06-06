import {
  PUBLIC_MAPBOX_ACCESS_TOKEN,
} from "astro:env/client";

const COMMERCE_API_BASE_URL = "__EMS_API_BASE_URL__";

export type CommerceMediaConfig = {
  cdnBaseUrl?: string | null;
};

let commerceMediaConfig: CommerceMediaConfig = {};

export function getCommerceConfig() {
  return {
    apiBaseUrl: COMMERCE_API_BASE_URL,
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

function normalizeOptionalToken(value: string | undefined) {
  if (!value || value.startsWith("replace-with-")) {
    return "";
  }

  return value;
}
