import { defineConfig, envField } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  env: {
    schema: {
      // --- Client-accessible (PUBLIC_*) ---
      PUBLIC_FEATURED_PRODUCT_SLUG: envField.string({
        context: "client",
        access: "public",
      }),
      PUBLIC_COMMERCE_API_BASE_URL: envField.string({
        context: "client",
        access: "public",
      }),
      COMMERCE_API_TOKEN: envField.string({
        context: "server",
        access: "secret",
      }),
      PUBLIC_CDN_BASE_URL: envField.string({
        context: "client",
        access: "public",
      }),
      PUBLIC_MAPBOX_ACCESS_TOKEN: envField.string({
        context: "client",
        access: "public",
        optional: true,
        default: "",
      }),

      // --- Site metadata (client-accessible) ---
      PUBLIC_SITE_NAME: envField.string({
        context: "client",
        access: "public",
      }),
      PUBLIC_SITE_LEGAL_NAME: envField.string({
        context: "client",
        access: "public",
      }),
      PUBLIC_SITE_DOMAIN: envField.string({
        context: "client",
        access: "public",
      }),
      PUBLIC_SUPPORT_EMAIL: envField.string({
        context: "client",
        access: "public",
      }),
      PUBLIC_PRIVACY_EMAIL: envField.string({
        context: "client",
        access: "public",
      }),
      PUBLIC_SUPPORT_RESPONSE_TIME: envField.string({
        context: "client",
        access: "public",
      }),
      PUBLIC_POLICY_UPDATED_AT: envField.string({
        context: "client",
        access: "public",
      }),
      PUBLIC_COPYRIGHT_YEAR: envField.string({
        context: "client",
        access: "public",
      }),
    },
  },
});
