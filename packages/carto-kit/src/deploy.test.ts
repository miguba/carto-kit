import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
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

async function installFakeAstro(root: string): Promise<void> {
  const bin = join(root, "node_modules", ".bin");
  await mkdir(bin, { recursive: true });
  if (process.platform === "win32") {
    await writeFile(join(bin, "astro.cmd"), "@echo off\r\nexit /b 1\r\n");
  } else {
    const path = join(bin, "astro");
    await writeFile(path, "#!/bin/sh\nexit 1\n");
    await chmod(path, 0o755);
  }
}

async function fakeWrangler(root: string): Promise<string> {
  const path = join(root, "fake-wrangler.cjs");
  await writeFile(path, "process.exit(1);\n");
  return path;
}

async function installCapturingAstro(root: string): Promise<void> {
  const bin = join(root, "node_modules", ".bin");
  await mkdir(bin, { recursive: true });
  const script = join(bin, "astro-fixture.cjs");
  await writeFile(script, `
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
  if (process.platform === "win32") {
    await writeFile(join(bin, "astro.cmd"), "@echo off\r\nnode \"%~dp0\\astro-fixture.cjs\" %*\r\n");
  } else {
    const path = join(bin, "astro");
    await writeFile(path, `#!/bin/sh\nexec node "$(dirname "$0")/astro-fixture.cjs" "$@"\n`);
    await chmod(path, 0o755);
  }
}

async function installAstro(root: string, version: string): Promise<void> {
  const packageRoot = join(root, "node_modules", "astro");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ version }));
  await installCapturingAstro(root);
}

async function adapterInstallingNpm(root: string, adapterVersion = "14.1.7"): Promise<string> {
  const path = join(root, "fake-npm.cjs");
  await writeFile(path, `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
fs.writeFileSync("captured-npm.json", JSON.stringify({
  args: process.argv.slice(2),
  nodeEnv: process.env.NODE_ENV
}));
if (!process.argv.includes("--include=dev")) process.exit(2);
const adapter = path.join(process.cwd(), "node_modules", "@astrojs", "cloudflare");
fs.mkdirSync(adapter, { recursive: true });
fs.writeFileSync(path.join(adapter, "package.json"), JSON.stringify({
  version: "${adapterVersion}",
  main: "index.js",
  exports: { ".": "./index.js", "./entrypoints/server": "./server.js" }
}));
fs.writeFileSync(path.join(adapter, "index.js"), "module.exports = () => ({});\\n");
fs.writeFileSync(path.join(adapter, "server.js"), "module.exports = {};\\n");
`);
  await chmod(path, 0o755);
  return path;
}

async function successfulWrangler(root: string): Promise<string> {
  const path = join(root, "successful-wrangler.cjs");
  await writeFile(path, `
const fs = require("node:fs");
const path = require("node:path");
const index = process.argv.indexOf("--config");
if (index >= 0) fs.copyFileSync(process.argv[index + 1], path.join(process.cwd(), "captured-wrangler.jsonc"));
if (process.argv.includes("whoami")) {
  process.stdout.write(JSON.stringify({ loggedIn: true, accounts: [{ id: "account-1", name: "Test Account" }] }));
  process.exit(0);
} else if (process.argv.includes("bulk")) {
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
if (process.argv.includes("whoami")) {
  process.stdout.write(JSON.stringify({ loggedIn: true, accounts: [{ id: "account-1", name: "Test Account" }] }));
  process.exit(0);
} else if (process.argv.includes("bulk")) {
  process.stdin.resume();
  process.stdin.on("end", () => process.exit(0));
} else process.exit(0);
`);
  return path;
}

async function capturingWrangler(root: string): Promise<string> {
  const path = join(root, "capturing-wrangler.cjs");
  await writeFile(path, `
const fs = require("node:fs");
fs.appendFileSync("wrangler-calls.jsonl", JSON.stringify({
  args: process.argv.slice(2),
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  apiToken: process.env.CLOUDFLARE_API_TOKEN
}) + "\\n");
if (process.argv.includes("whoami")) {
  const accounts = process.env.TEST_MULTIPLE_ACCOUNTS
    ? [{ id: "first-account", name: "First Account" }, { id: "new-account", name: "New Account" }]
    : [{ id: "new-account", name: "New Account" }];
  process.stdout.write(JSON.stringify({ loggedIn: true, accounts }));
  process.exit(0);
} else if (process.argv.includes("bulk")) {
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

test("deploy rejects an unavailable framework adapter explicitly", async () => {
  const root = await frontsiteFixture();
  await writeFile(join(root, "carto.config.json"), JSON.stringify({
    schemaVersion: 1,
    framework: "nextjs",
    deployment: { provider: "cloudflare-workers" }
  }));
  await assert.rejects(runDeploy(root), /Unsupported framework "nextjs".*Installed adapters: astro/);
});

test("deploy rejects unsafe custom domain values", async () => {
  const root = await frontsiteFixture();
  await writeFile(join(root, "carto.config.json"), JSON.stringify({
    schemaVersion: 1,
    deployment: {
      provider: "cloudflare-workers",
      customDomain: "https://shop.example.com/path"
    }
  }));
  await assert.rejects(runDeploy(root), /without a protocol, path, port, or wildcard/);
});

test("deploy requests browser authorization instead of requiring API credentials locally", async () => {
  const root = await frontsiteFixture();
  await installFakeAstro(root);
  const wranglerPath = await fakeWrangler(root);
  await writeFile(join(root, ".env"), "PUBLIC_COMMERCE_API_BASE_URL=https://carto.example.com\nCOMMERCE_API_TOKEN=test-token\n");
  const previousCi = process.env.CI;
  const previousBaseUrl = process.env.PUBLIC_COMMERCE_API_BASE_URL;
  const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const previousToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CI = "true";
  delete process.env.PUBLIC_COMMERCE_API_BASE_URL;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  try {
    await assert.rejects(runDeploy(root, { wranglerPath }), /interactive terminal to authorize in your browser/);
  } finally {
    if (previousCi === undefined) delete process.env.CI; else process.env.CI = previousCi;
    if (previousBaseUrl === undefined) delete process.env.PUBLIC_COMMERCE_API_BASE_URL; else process.env.PUBLIC_COMMERCE_API_BASE_URL = previousBaseUrl;
    if (previousAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;
    if (previousToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = previousToken;
  }
});

test("deploy reauthorizes Cloudflare before publishing when requested", async () => {
  const root = await frontsiteFixture();
  await installCapturingAstro(root);
  const wranglerPath = await capturingWrangler(root);
  await writeFile(join(root, ".env"), "PUBLIC_COMMERCE_API_BASE_URL=https://carto.example.com\nCOMMERCE_API_TOKEN=test-token\n");
  await writeFile(join(root, "carto.config.json"), JSON.stringify({
    schemaVersion: 1,
    deployment: { provider: "cloudflare-workers", customDomain: null }
  }));
  const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const previousApiToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = "old-account";
  process.env.CLOUDFLARE_API_TOKEN = "old-token";
  try {
    await runDeploy(root, {
      interactive: true,
      reauth: true,
      wranglerPath,
      cloudflareAdapterPath: "/bundled/cloudflare-adapter.js",
      cloudflareEntrypointPath: "/bundled/cloudflare-server.js"
    });
    const calls = (await readFile(join(root, "wrangler-calls.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(calls.slice(0, 3).map((call) => call.args), [
      ["logout"],
      ["login", "--use-keyring"],
      ["whoami", "--json"]
    ]);
    assert.equal(calls[0].accountId, undefined);
    assert.equal(calls[1].accountId, undefined);
    assert.equal(calls[2].accountId, undefined);
    assert.ok(calls.slice(3).every((call) => call.accountId === "new-account" && call.apiToken === undefined));
  } finally {
    if (previousAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;
    if (previousApiToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = previousApiToken;
  }
});

test("deploy supports an explicit account ID with saved OAuth credentials", async () => {
  const root = await frontsiteFixture();
  await installCapturingAstro(root);
  const wranglerPath = await capturingWrangler(root);
  await writeFile(join(root, ".env"), "PUBLIC_COMMERCE_API_BASE_URL=https://carto.example.com\nCOMMERCE_API_TOKEN=test-token\n");
  await writeFile(join(root, "carto.config.json"), JSON.stringify({
    schemaVersion: 1,
    deployment: { provider: "cloudflare-workers", customDomain: null }
  }));
  const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const previousApiToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = "oauth-account";
  delete process.env.CLOUDFLARE_API_TOKEN;
  try {
    await runDeploy(root, {
      interactive: true,
      wranglerPath,
      cloudflareAdapterPath: "/bundled/cloudflare-adapter.js",
      cloudflareEntrypointPath: "/bundled/cloudflare-server.js"
    });
    const calls = (await readFile(join(root, "wrangler-calls.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    assert.ok(calls.every((call) => call.accountId === "oauth-account" && call.apiToken === undefined));
  } finally {
    if (previousAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;
    if (previousApiToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = previousApiToken;
  }
});

test("deploy selects one of multiple OAuth accounts for the full deployment", async () => {
  const root = await frontsiteFixture();
  await installCapturingAstro(root);
  const wranglerPath = await capturingWrangler(root);
  await writeFile(join(root, ".env"), "PUBLIC_COMMERCE_API_BASE_URL=https://carto.example.com\nCOMMERCE_API_TOKEN=test-token\n");
  await writeFile(join(root, "carto.config.json"), JSON.stringify({
    schemaVersion: 1,
    deployment: { provider: "cloudflare-workers", customDomain: null }
  }));
  const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const previousApiToken = process.env.CLOUDFLARE_API_TOKEN;
  const previousMultipleAccounts = process.env.TEST_MULTIPLE_ACCOUNTS;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  process.env.TEST_MULTIPLE_ACCOUNTS = "1";
  try {
    await runDeploy(root, {
      interactive: true,
      wranglerPath,
      selectCloudflareAccount: async (accounts) => {
        assert.deepEqual(accounts.map((account) => account.id), ["first-account", "new-account"]);
        return "new-account";
      },
      cloudflareAdapterPath: "/bundled/cloudflare-adapter.js",
      cloudflareEntrypointPath: "/bundled/cloudflare-server.js"
    });
    const calls = (await readFile(join(root, "wrangler-calls.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(calls[0].accountId, undefined);
    assert.ok(calls.slice(1).every((call) => call.accountId === "new-account"));
  } finally {
    if (previousAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;
    if (previousApiToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = previousApiToken;
    if (previousMultipleAccounts === undefined) delete process.env.TEST_MULTIPLE_ACCOUNTS;
    else process.env.TEST_MULTIPLE_ACCOUNTS = previousMultipleAccounts;
  }
});

test("deploy rejects Cloudflare reauthentication outside an interactive terminal", async () => {
  const root = await frontsiteFixture();
  await installFakeAstro(root);
  await writeFile(join(root, ".env"), "PUBLIC_COMMERCE_API_BASE_URL=https://carto.example.com\nCOMMERCE_API_TOKEN=test-token\n");
  await assert.rejects(
    runDeploy(root, { interactive: false, reauth: true }),
    /reauthentication requires an interactive terminal/
  );
});

test("deploy rejects custom domain reconfiguration outside an interactive terminal", async () => {
  const root = await frontsiteFixture();
  await installFakeAstro(root);
  const wranglerPath = await noOpWrangler();
  await writeFile(join(root, ".env"), "PUBLIC_COMMERCE_API_BASE_URL=https://carto.example.com\nCOMMERCE_API_TOKEN=test-token\n");
  await writeFile(join(root, "carto.config.json"), JSON.stringify({
    schemaVersion: 1,
    deployment: { provider: "cloudflare-workers", customDomain: null }
  }));
  await assert.rejects(
    runDeploy(root, { interactive: false, reconfigureDomain: true, wranglerPath }),
    /domain reconfiguration requires an interactive terminal/
  );
});

test("deploy builds with temporary Cloudflare configuration", async () => {
  const root = await frontsiteFixture();
  await installCapturingAstro(root);
  const wranglerPath = await successfulWrangler(root);
  await writeFile(join(root, ".env"), "PUBLIC_COMMERCE_API_BASE_URL=https://carto.example.com\nCOMMERCE_API_TOKEN=test-token\n");
  await writeFile(join(root, "carto.config.json"), JSON.stringify({
    schemaVersion: 1,
    deployment: { provider: "cloudflare-workers", customDomain: null }
  }));
  const previousToken = process.env.COMMERCE_API_TOKEN;
  const previousBaseUrl = process.env.PUBLIC_COMMERCE_API_BASE_URL;
  const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const previousApiToken = process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.COMMERCE_API_TOKEN;
  delete process.env.PUBLIC_COMMERCE_API_BASE_URL;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  try {
    await runDeploy(root, {
      interactive: true,
      wranglerPath,
      cloudflareAdapterPath: "/bundled/cloudflare-adapter.js",
      cloudflareEntrypointPath: "/bundled/cloudflare-server.js",
      reconfigureDomain: true,
      confirmCustomDomain: async () => true,
      inputCustomDomain: async () => "Shop.Example.com"
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
    assert.equal(wranglerConfig.workers_dev, true);
    assert.equal(wranglerConfig.preview_urls, true);
    assert.deepEqual(wranglerConfig.vars, {
      PUBLIC_COMMERCE_API_BASE_URL: "https://carto.example.com"
    });
    assert.deepEqual(wranglerConfig.kv_namespaces, [{ binding: "SESSION" }]);
    assert.deepEqual(wranglerConfig.routes, [
      { pattern: "shop.example.com", custom_domain: true }
    ]);
    const savedConfig = JSON.parse(await readFile(join(root, "carto.config.json"), "utf8"));
    assert.equal(savedConfig.deployment.customDomain, "shop.example.com");
  } finally {
    if (previousToken === undefined) delete process.env.COMMERCE_API_TOKEN; else process.env.COMMERCE_API_TOKEN = previousToken;
    if (previousBaseUrl === undefined) delete process.env.PUBLIC_COMMERCE_API_BASE_URL; else process.env.PUBLIC_COMMERCE_API_BASE_URL = previousBaseUrl;
    if (previousAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;
    if (previousApiToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = previousApiToken;
  }
});

test("deploy installs the Astro 7 adapter even in the production deployment environment", async () => {
  const root = await frontsiteFixture();
  await installAstro(root, "7.1.6");
  const npmPath = await adapterInstallingNpm(root);
  const wranglerPath = await successfulWrangler(root);
  await writeFile(join(root, ".env"), "PUBLIC_COMMERCE_API_BASE_URL=https://carto.example.com\nCOMMERCE_API_TOKEN=test-token\n");
  await writeFile(join(root, "carto.config.json"), JSON.stringify({
    schemaVersion: 1,
    deployment: { provider: "cloudflare-workers", customDomain: null }
  }));
  const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const previousApiToken = process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  try {
    await runDeploy(root, { interactive: true, npmPath, wranglerPath });
    const invocation = JSON.parse(await readFile(join(root, "captured-npm.json"), "utf8"));
    assert.equal(invocation.nodeEnv, "production");
    assert.deepEqual(invocation.args, [
      "install",
      "--save-dev",
      "--include=dev",
      "--no-audit",
      "--no-fund",
      "@astrojs/cloudflare@^14.1.7"
    ]);
  } finally {
    if (previousAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;
    if (previousApiToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = previousApiToken;
  }
});

test("deploy builds an Astro 6 Frontsite with its matching adapter", async () => {
  const root = await frontsiteFixture();
  await installAstro(root, "6.20.0");
  const npmPath = await adapterInstallingNpm(root, "13.7.0");
  const wranglerPath = await noOpWrangler();
  const previousToken = process.env.COMMERCE_API_TOKEN;
  const previousBaseUrl = process.env.PUBLIC_COMMERCE_API_BASE_URL;
  const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const previousApiToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.COMMERCE_API_TOKEN = "test-token";
  process.env.PUBLIC_COMMERCE_API_BASE_URL = "https://carto.example.com";
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  try {
    await runDeploy(root, { npmPath, wranglerPath });
    const invocation = JSON.parse(await readFile(join(root, "captured-npm.json"), "utf8"));
    assert.deepEqual(invocation.args, [
      "install",
      "--save-dev",
      "--include=dev",
      "--no-audit",
      "--no-fund",
      "@astrojs/cloudflare@^13.7.0"
    ]);
  } finally {
    if (previousToken === undefined) delete process.env.COMMERCE_API_TOKEN; else process.env.COMMERCE_API_TOKEN = previousToken;
    if (previousBaseUrl === undefined) delete process.env.PUBLIC_COMMERCE_API_BASE_URL; else process.env.PUBLIC_COMMERCE_API_BASE_URL = previousBaseUrl;
    if (previousAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;
    if (previousApiToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = previousApiToken;
  }
});
