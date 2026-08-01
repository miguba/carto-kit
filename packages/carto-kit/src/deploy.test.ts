import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

async function installFakeAstro(root: string): Promise<void> {
  const bin = join(root, "node_modules", ".bin");
  await mkdir(bin, { recursive: true });
  const path = join(bin, "astro");
  await writeFile(path, "#!/bin/sh\nexit 1\n");
  await chmod(path, 0o755);
}

async function fakeWrangler(root: string): Promise<string> {
  const path = join(root, "fake-wrangler.cjs");
  await writeFile(path, "process.exit(1);\n");
  return path;
}

async function installCapturingAstro(root: string): Promise<void> {
  const bin = join(root, "node_modules", ".bin");
  await mkdir(bin, { recursive: true });
  const path = join(bin, "astro");
  await writeFile(path, `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const index = process.argv.indexOf("--config");
const configPath = process.argv[index + 1];
if (path.isAbsolute(configPath)) process.exit(2);
const astroConfig = fs.readFileSync(path.join(process.cwd(), configPath), "utf8");
fs.writeFileSync(path.join(process.cwd(), "captured-astro-config.mjs"), astroConfig);
const wranglerConfigPath = JSON.parse(astroConfig.match(/configPath: ("[^"]+")/)[1]);
fs.mkdirSync(path.join(process.cwd(), "dist", "server"), { recursive: true });
fs.copyFileSync(wranglerConfigPath, path.join(process.cwd(), "dist", "server", "wrangler.json"));
`);
  await chmod(path, 0o755);
}

async function successfulWrangler(root: string): Promise<string> {
  const path = join(root, "successful-wrangler.cjs");
  await writeFile(path, `
const fs = require("node:fs");
const path = require("node:path");
const index = process.argv.indexOf("--config");
if (index >= 0) fs.copyFileSync(process.argv[index + 1], path.join(process.cwd(), "captured-wrangler.jsonc"));
if (process.argv.includes("bulk")) {
  process.stdin.resume();
  process.stdin.on("end", () => process.exit(0));
} else process.exit(0);
`);
  return path;
}

async function noOpWrangler(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "carto-wrangler-test-"));
  const path = join(root, "wrangler.cjs");
  await writeFile(path, `
if (process.argv.includes("bulk")) {
  process.stdin.resume();
  process.stdin.on("end", () => process.exit(0));
} else process.exit(0);
`);
  return path;
}

test("deploy requires an interactive Carto connection when the token is missing", async () => {
  const root = await frontsiteFixture();
  const previous = process.env.COMMERCE_API_TOKEN;
  delete process.env.COMMERCE_API_TOKEN;
  try { await assert.rejects(runDeploy(root, { interactive: false }), /Carto connection is required/); }
  finally {
    if (previous === undefined) delete process.env.COMMERCE_API_TOKEN;
    else process.env.COMMERCE_API_TOKEN = previous;
  }
});

test("deploy reuses connect and reloads the resulting Carto token", async () => {
  const root = await frontsiteFixture();
  const previous = process.env.COMMERCE_API_TOKEN;
  delete process.env.COMMERCE_API_TOKEN;
  let connected = false;
  try {
    await assert.rejects(runDeploy(root, {
      interactive: true,
      connect: async (options) => {
        connected = true;
        assert.equal(options.projectDir, root);
        await writeFile(join(root, ".env"), "PUBLIC_COMMERCE_API_BASE_URL=https://carto.example.com\nCOMMERCE_API_TOKEN=connected-token\n");
      }
    }), /Missing astro/);
    assert.equal(connected, true);
    assert.equal(process.env.COMMERCE_API_TOKEN, "connected-token");
  } finally {
    if (previous === undefined) delete process.env.COMMERCE_API_TOKEN;
    else process.env.COMMERCE_API_TOKEN = previous;
  }
});

test("deploy rejects incompatible project configuration", async () => {
  const root = await frontsiteFixture();
  await writeFile(join(root, "carto.config.json"), JSON.stringify({
    schemaVersion: 2, deployment: { provider: "cloudflare-workers" }
  }));
  await assert.rejects(runDeploy(root), /schemaVersion 2/);
});

test("deploy requests browser authorization instead of requiring API credentials locally", async () => {
  const root = await frontsiteFixture();
  await installFakeAstro(root);
  const wranglerPath = await fakeWrangler(root);
  await writeFile(join(root, ".env"), "COMMERCE_API_TOKEN=test-token\n");
  const previousCi = process.env.CI;
  const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const previousToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CI = "true";
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  try {
    await assert.rejects(runDeploy(root, { wranglerPath }), /interactive terminal to authorize in your browser/);
  } finally {
    if (previousCi === undefined) delete process.env.CI; else process.env.CI = previousCi;
    if (previousAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;
    if (previousToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = previousToken;
  }
});

test("deploy builds with temporary Cloudflare configuration", async () => {
  const root = await frontsiteFixture();
  await installCapturingAstro(root);
  const wranglerPath = await successfulWrangler(root);
  await writeFile(join(root, ".env"), "COMMERCE_API_TOKEN=test-token\n");
  const previousToken = process.env.COMMERCE_API_TOKEN;
  const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const previousApiToken = process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.COMMERCE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  try {
    await runDeploy(root, {
      wranglerPath,
      cloudflareAdapterPath: "/bundled/cloudflare-adapter.js",
      cloudflareEntrypointPath: "/bundled/cloudflare-server.js"
    });
    const astroConfig = await readFile(join(root, "captured-astro-config.mjs"), "utf8");
    assert.match(astroConfig, /adapter: cloudflare\(\{ configPath: .*wrangler\.jsonc.*, imageService: 'passthrough', prerenderEnvironment: 'node' \}\)/);
    assert.match(astroConfig, /astro\.config\.mjs/);
    assert.match(astroConfig, new RegExp(`root: ${JSON.stringify(root).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.doesNotMatch(astroConfig, /root: new URL/);
    const wranglerConfig = JSON.parse(await readFile(join(root, "captured-wrangler.jsonc"), "utf8"));
    assert.equal(wranglerConfig.main, "/bundled/cloudflare-server.js");
    assert.equal(wranglerConfig.assets.directory, join(root, "dist"));
    assert.equal(wranglerConfig.compatibility_date, "2025-04-01");
    assert.deepEqual(wranglerConfig.kv_namespaces, [{ binding: "SESSION" }]);
  } finally {
    if (previousToken === undefined) delete process.env.COMMERCE_API_TOKEN; else process.env.COMMERCE_API_TOKEN = previousToken;
    if (previousAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;
    if (previousApiToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = previousApiToken;
  }
});

test("deploy builds the Astro 6 Frontsite template with its matching adapter", async () => {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const root = join(repositoryRoot, "templates", "single-product");
  const wranglerPath = await noOpWrangler();
  const previousToken = process.env.COMMERCE_API_TOKEN;
  const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const previousApiToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.COMMERCE_API_TOKEN = "test-token";
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  try {
    await runDeploy(root, { wranglerPath });
  } finally {
    if (previousToken === undefined) delete process.env.COMMERCE_API_TOKEN; else process.env.COMMERCE_API_TOKEN = previousToken;
    if (previousAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;
    if (previousApiToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = previousApiToken;
  }
});
