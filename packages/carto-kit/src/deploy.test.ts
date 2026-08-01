import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDeploy } from "./deploy.js";

async function frontsiteFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "carto-deploy-test-"));
  await mkdir(join(root, "src/lib"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({
    name: "test-store", scripts: { dev: "astro dev" }, dependencies: { astro: "1" }
  }));
  await writeFile(join(root, "astro.config.mjs"), "");
  await writeFile(join(root, "src/lib/commerce.ts"), "COMMERCE_API_TOKEN; fetch('/api/commerce/config')");
  await writeFile(join(root, ".env.example"), "PUBLIC_COMMERCE_API_BASE_URL=https://carto.example.com");
  return root;
}

test("deploy fails safely before build when Cloudflare credentials are missing", async () => {
  const root = await frontsiteFixture();
  const previous = process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  try { await assert.rejects(runDeploy(root), /CLOUDFLARE_ACCOUNT_ID/); }
  finally {
    if (previous === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = previous;
  }
});

test("deploy rejects incompatible project configuration", async () => {
  const root = await frontsiteFixture();
  await writeFile(join(root, "carto.config.json"), JSON.stringify({
    schemaVersion: 2, deployment: { provider: "cloudflare-workers" }
  }));
  await assert.rejects(runDeploy(root), /schemaVersion 2/);
});
