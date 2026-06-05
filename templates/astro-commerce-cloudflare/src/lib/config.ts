import {
  PUBLIC_FEATURED_PRODUCT_SLUG,
  PUBLIC_COMMERCE_API_BASE_URL,
  PUBLIC_CDN_BASE_URL,
  PUBLIC_MAPBOX_ACCESS_TOKEN,
  PUBLIC_SITE_NAME,
  PUBLIC_SITE_LEGAL_NAME,
  PUBLIC_SITE_DOMAIN,
  PUBLIC_SUPPORT_EMAIL,
  PUBLIC_PRIVACY_EMAIL,
  PUBLIC_SUPPORT_RESPONSE_TIME,
  PUBLIC_POLICY_UPDATED_AT,
  PUBLIC_COPYRIGHT_YEAR,
} from "astro:env/client";

export const FEATURED_PRODUCT_SLUG = PUBLIC_FEATURED_PRODUCT_SLUG;

export function getCommerceConfig() {
  return {
    apiBaseUrl: normalizeBaseUrl(PUBLIC_COMMERCE_API_BASE_URL),
    cdnBaseUrl: normalizeBaseUrl(PUBLIC_CDN_BASE_URL),
    mapboxAccessToken: normalizeOptionalToken(PUBLIC_MAPBOX_ACCESS_TOKEN),
  };
}

export function getSiteConfig() {
  return {
    name: PUBLIC_SITE_NAME,
    legalName: PUBLIC_SITE_LEGAL_NAME,
    domain: PUBLIC_SITE_DOMAIN,
    supportEmail: PUBLIC_SUPPORT_EMAIL,
    privacyEmail: PUBLIC_PRIVACY_EMAIL,
    supportResponseTime: PUBLIC_SUPPORT_RESPONSE_TIME,
    policyUpdatedAt: PUBLIC_POLICY_UPDATED_AT,
    copyrightYear: PUBLIC_COPYRIGHT_YEAR,
  };
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function normalizeOptionalToken(value: string | undefined) {
  if (!value || value.startsWith("replace-with-")) {
    return "";
  }

  return value;
}
