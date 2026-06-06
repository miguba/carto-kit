import { defineConfig, envField } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

const deploymentTarget = process.env.DEPLOYMENT_TARGET || "__DEPLOYMENT_TARGET__";
const adapter = deploymentTarget === "cloudflare-workers"
  ? (await import("@astrojs/cloudflare")).default()
  : node({ mode: "standalone" });

export default defineConfig({
  output: "server",
  adapter,
  integrations: [react()],
  session: {
    driver: {
      entrypoint: new URL("./src/lib/disabled-session-driver.ts", import.meta.url),
    },
  },
  vite: {
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    plugins: [tailwindcss()],
  },
  env: {
    schema: {
      // --- Client-accessible (PUBLIC_*) ---
      COMMERCE_API_TOKEN: envField.string({
        context: "server",
        access: "secret",
      }),
      PUBLIC_MAPBOX_ACCESS_TOKEN: envField.string({
        context: "client",
        access: "public",
        optional: true,
        default: "",
      }),
    },
  },
});
