import type { SiteConfig } from "./commerce";
import { normalizeMediaUrl } from "./format";

export type BrandLogo = {
  src: string;
  alt: string;
  isDefault: boolean;
};

const DEFAULT_LOGO_SRC = "/logo.svg";

export function getBrandLogo(site: SiteConfig): BrandLogo {
  const configuredLogo = firstString(
    site.logoUrl,
    site.logo,
    site.logoImage,
    site.brandLogo,
  );

  return {
    src: configuredLogo ? normalizeMediaUrl(configuredLogo) : DEFAULT_LOGO_SRC,
    alt: firstString(site.logoAlt, site.name) ?? "Store logo",
    isDefault: !configuredLogo,
  };
}

function firstString(...values: unknown[]) {
  return values.find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  )?.trim();
}
