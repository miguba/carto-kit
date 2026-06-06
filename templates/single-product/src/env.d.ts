/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly EMS_SITE_DOMAIN: string;
  readonly PUBLIC_SITE_URL: string;
  readonly PRODUCT_DETAIL_URL_TEMPLATE: string;
  readonly EMS_SERVER_APP_TOKEN?: string;
  readonly FRONTEND_MODE?: "ssr" | "static";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
