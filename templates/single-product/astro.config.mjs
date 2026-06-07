import { defineConfig, envField, sessionDrivers } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

const deploymentTarget = process.env.DEPLOYMENT_TARGET || "__DEPLOYMENT_TARGET__";
const adapter = deploymentTarget === "cloudflare-workers"
  ? (await import("@astrojs/cloudflare")).default()
  : node({ mode: "standalone" });

export default defineConfig({
  output: 'server',
  adapter,
  session: {
    driver: sessionDrivers.lruCache(),
  },
  integrations: [react()],
  vite: {
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    plugins: [tailwindcss()],
  },
  env: {
    schema: {
      COMMERCE_API_TOKEN: envField.string({
        context: 'server',
        access: 'secret',
      }),
    },
  },
});
