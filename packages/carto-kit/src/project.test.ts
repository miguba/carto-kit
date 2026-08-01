import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectFrontsiteProject } from "./project.js";

test("recognizes the current Frontsite layout without src/lib/config.ts", async () => {
  const root = await mkdtemp(join(tmpdir(), "carto-project-test-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "shop", scripts: { dev: "astro dev" }, dependencies: { astro: "1" } }));
  await assert.rejects(inspectFrontsiteProject(root), /expected Astro/);
  await mkdir(join(root, "src/lib"), { recursive: true });
  await writeFile(join(root, "astro.config.mjs"), "");
  await writeFile(join(root, "src/lib/commerce.ts"), "COMMERCE_API_TOKEN; fetch('/api/commerce/config')");
  await writeFile(join(root, ".env.example"), "PUBLIC_COMMERCE_API_BASE_URL=https://carto.example.com");
  assert.equal((await inspectFrontsiteProject(root)).packageName, "shop");
});
