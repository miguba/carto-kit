#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";

const root = resolve(process.cwd());
loadEnv(resolve(root, ".env"));

const required = ["VPS_HOST", "VPS_USER", "VPS_DEPLOY_DIR", "VPS_PM2_APP_NAME"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  fail(`Missing deploy config: ${missing.join(", ")}. Fill these values in .env.`);
}

const host = process.env.VPS_HOST;
const port = process.env.VPS_PORT || "22";
const user = process.env.VPS_USER;
const key = process.env.VPS_SSH_KEY;
const deployDir = process.env.VPS_DEPLOY_DIR;
const appName = process.env.VPS_PM2_APP_NAME;
const appPort = process.env.VPS_APP_PORT || "4321";
const caddyDomain = process.env.VPS_CADDY_DOMAIN;
const remote = `${user}@${host}`;
const sshArgs = ["-p", port];
if (key) sshArgs.push("-i", key);
const scpArgs = ["-P", port];
if (key) scpArgs.push("-i", key);
const sshControlPath = join(tmpdir(), `carto-ssh-${process.pid}-%r@%h:%p`);
const sshControlArgs = [
  "-o", "ControlMaster=auto",
  "-o", "ControlPersist=10m",
  "-o", `ControlPath=${sshControlPath}`
];
sshArgs.push(...sshControlArgs);
scpArgs.push(...sshControlArgs);
const sshTtyArgs = ["-t", ...sshArgs];
const bootstrapScript = resolve(root, "scripts", "bootstrap-vps.sh");

try {
  await run("npm", ["run", "build"], {
    errorHint: "Astro build failed. Review the local build output above."
  });

  const tmp = await mkdtemp(join(tmpdir(), "carto-"));
  const archive = join(tmp, "storefront.tgz");
  const runtimeEnv = join(tmp, "runtime.env");
  await writeFile(runtimeEnv, buildRuntimeEnv());
  const tarArgs = [
    "--exclude=node_modules",
    "--exclude=.astro",
    "--exclude=.env",
    "-czf",
    archive,
    "dist",
    "package.json",
    "astro.config.mjs"
  ];
  if (process.platform === "darwin") {
    tarArgs.unshift("--no-xattrs", "--no-mac-metadata");
  }
  if (existsSync(resolve(root, "package-lock.json"))) {
    tarArgs.push("package-lock.json");
  }
  await run("tar", tarArgs);

  await run("ssh", [...sshArgs, remote, `mkdir -p ${shellQuote(deployDir)}`], {
    errorHint: "SSH connection failed. Check VPS_HOST, VPS_USER, VPS_PORT, and VPS_SSH_KEY."
  });

  await run("scp", [...scpArgs, bootstrapScript, `${remote}:/tmp/carto-bootstrap-vps.sh`], {
    errorHint: "VPS bootstrap script upload failed. Check SSH and /tmp permissions."
  });
  await run("ssh", [...sshTtyArgs, remote, "chmod +x /tmp/carto-bootstrap-vps.sh && /tmp/carto-bootstrap-vps.sh"], {
    errorHint: "VPS bootstrap failed. The script supports apt-get, dnf, yum, or apk servers with sudo access."
  });

  await run("scp", [...scpArgs, archive, `${remote}:${deployDir}/storefront.tgz`], {
    errorHint: "Upload failed. Check remote directory permissions or choose another VPS_DEPLOY_DIR."
  });
  await run("scp", [...scpArgs, runtimeEnv, `${remote}:${deployDir}/.env`], {
    errorHint: "Runtime environment upload failed. Check remote directory permissions."
  });

  await run("ssh", [...sshArgs, remote, [
    `cd ${shellQuote(deployDir)}`,
    "tar -xzf storefront.tgz",
    "export PATH=/usr/local/carto-node/bin:/usr/local/bin:$PATH",
    "npm install --omit=dev --no-audit --no-fund --prefer-offline --maxsockets=1",
    `set -a && . ./.env && set +a && export HOST=127.0.0.1 && export PORT=${shellQuote(appPort)} && (pm2 describe ${shellQuote(appName)} >/dev/null && pm2 restart ${shellQuote(appName)} --update-env || pm2 start dist/server/entry.mjs --name ${shellQuote(appName)} --update-env)`
  ].join(" && ")], {
    errorHint: "Remote install or PM2 start failed. Check PM2 logs on the VPS."
  });

  if (caddyDomain) {
    await maybeWriteCaddyConfig(caddyDomain, appPort);
  }

  console.log(`Deploy complete: https://${caddyDomain || host}`);
  await rm(tmp, { force: true, recursive: true });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await closeSshControlMaster();
}

async function maybeWriteCaddyConfig(domain, upstreamPort) {
  const siteAddresses = formatCaddySiteAddresses(domain);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Write Caddy config for ${siteAddresses} -> 127.0.0.1:${upstreamPort}? [y/N] `);
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) return;

  const caddyfile = `${siteAddresses} {
  reverse_proxy 127.0.0.1:${upstreamPort}
}
`;
  const tmpFile = join(tmpdir(), `Caddyfile.${Date.now()}`);
  await writeFile(tmpFile, caddyfile);
  await run("scp", [...scpArgs, tmpFile, `${remote}:/tmp/carto.Caddyfile`]);
  await run("ssh", [...sshTtyArgs, remote, [
    "CADDY_BIN=\"$(command -v caddy || command -v /usr/local/bin/caddy || command -v /usr/bin/caddy)\"",
    "sudo mv /tmp/carto.Caddyfile /etc/caddy/Caddyfile",
    "sudo \"$CADDY_BIN\" validate --config /etc/caddy/Caddyfile",
    "sudo systemctl reload caddy || sudo systemctl restart caddy"
  ].join(" && ")], {
    errorHint: "Caddy config failed. Check DNS, ports 80/443, and Caddy logs manually."
  });
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", (error) => reject(new Error(`${error.message}${options.errorHint ? `\n${options.errorHint}` : ""}`)));
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
      } else if (options.ignoreFailure) {
        resolveRun();
      } else {
        reject(new Error(`${command} exited with code ${code}.${options.errorHint ? `\n${options.errorHint}` : ""}`));
      }
    });
  });
}

function loadEnv(path) {
  if (!existsSync(path)) return;
  const contents = readFileSync(path, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function buildRuntimeEnv() {
  const allowed = [
    "APP_NAME",
    "APP_ENV",
    "DEPLOYMENT_TARGET",
    "COMMERCE_API_TOKEN",
    "PUBLIC_MAPBOX_ACCESS_TOKEN",
    "EMS_SITE_DOMAIN",
    "PUBLIC_SITE_URL",
    "PRODUCT_DETAIL_URL_TEMPLATE",
    "EMS_SERVER_APP_TOKEN",
    "FRONTEND_MODE"
  ];
  const lines = ["NODE_ENV=production"];
  for (const key of allowed) {
    if (process.env[key]) lines.push(`${key}=${quoteEnv(process.env[key])}`);
  }
  return `${lines.join("\n")}\n`;
}

function quoteEnv(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function formatCaddySiteAddresses(value) {
  return String(value)
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean)
    .join(", ");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function closeSshControlMaster() {
  await run("ssh", [...sshArgs, "-O", "exit", remote], { ignoreFailure: true });
}
