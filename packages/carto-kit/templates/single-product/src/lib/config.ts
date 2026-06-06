export const EMS_API_BASE_URL = "__EMS_API_BASE_URL__";
export const EMS_SITE_DOMAIN = import.meta.env.EMS_SITE_DOMAIN || "__EMS_SITE_DOMAIN__";
export const PUBLIC_SITE_URL = import.meta.env.PUBLIC_SITE_URL || "__PUBLIC_SITE_URL__";
export const PRODUCT_DETAIL_URL_TEMPLATE = import.meta.env.PRODUCT_DETAIL_URL_TEMPLATE || "/products/{slug}";
export const FRONTEND_MODE = import.meta.env.FRONTEND_MODE || "__FRONTEND_MODE__";

export function getServerHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "accept": "application/json",
    "x-ems-site-domain": EMS_SITE_DOMAIN
  };

  const token = import.meta.env.EMS_SERVER_APP_TOKEN;
  if (FRONTEND_MODE === "ssr" && token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
}
