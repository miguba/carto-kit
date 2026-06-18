#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const openapiUrl =
  process.env.CARTO_STOREFRONT_OPENAPI_URL ||
  "https://carto.build/openapi/storefront-v1.yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = resolve(root, "docs", "storefront-v1.openapi.yaml");
const typesPath = resolve(root, "src", "storefront-api.ts");

await mkdir(dirname(specPath), { recursive: true });
await mkdir(dirname(typesPath), { recursive: true });

const response = await fetch(openapiUrl);
if (!response.ok) {
  throw new Error(
    `Failed to download Carto Storefront OpenAPI document: ${response.status} ${response.statusText}`,
  );
}

await writeFile(specPath, await response.text());
await runOpenApiTypescript(specPath, typesPath);

console.log(`Synced ${openapiUrl}`);
console.log(`  OpenAPI: ${relativeToRoot(specPath)}`);
console.log(`  Types:   ${relativeToRoot(typesPath)}`);

function runOpenApiTypescript(input, output) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, ["openapi-typescript", input, "-o", output], {
      cwd: root,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`openapi-typescript exited with code ${code}`));
    });
  });
}

function relativeToRoot(path) {
  return path.slice(root.length + 1).replaceAll("\\", "/");
}
