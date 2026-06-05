import { defineConfig } from "astro/config";
import node from "@astrojs/node";

const mode = process.env.FRONTEND_MODE || "__FRONTEND_MODE__";
const isStatic = mode === "static";

export default defineConfig({
  output: isStatic ? "static" : "server",
  adapter: isStatic ? undefined : node({ mode: "standalone" }),
  vite: {
    define: {
      "import.meta.env.FRONTEND_MODE": JSON.stringify(mode)
    }
  }
});
