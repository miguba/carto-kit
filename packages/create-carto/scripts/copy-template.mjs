import { cp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const repoRoot = resolve(packageRoot, "../..");

await rm(resolve(packageRoot, "templates"), { force: true, recursive: true });
await cp(resolve(repoRoot, "templates"), resolve(packageRoot, "templates"), {
  recursive: true,
  filter: (source) => {
    const normalized = source.replaceAll("\\", "/");
    const name = normalized.split("/").at(-1) ?? "";

    return !normalized.includes("/node_modules")
      && !normalized.includes("/.astro")
      && !normalized.includes("/.wrangler")
      && !normalized.includes("/dist")
      && (name === ".env.example" || (name !== ".env" && !name.startsWith(".env.")));
  }
});
