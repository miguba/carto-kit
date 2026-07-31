#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = resolve(root, "packages/carto-kit/package.json");
const lockPath = resolve(root, "package-lock.json");
const args = process.argv.slice(2);
const publish = args.includes("--publish");
const explicitVersion = args.find((arg) => /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(arg));
const bump = ["patch", "minor", "major"].find((kind) => args.includes(`--${kind}`));
const otpIndex = args.indexOf("--otp");
const otp = otpIndex >= 0 ? args[otpIndex + 1] : undefined;

if (args.includes("--help") || args.includes("-h")) {
  console.log("npm run release:npm -- <version|--patch|--minor|--major> [--dry-run|--publish] [--otp code]");
  process.exit(0);
}
if (!explicitVersion && !bump) fail("Pass a version or --patch, --minor, or --major.");
if (otpIndex >= 0 && !otp) fail("--otp requires a value.");

const originalPackage = readFileSync(packagePath, "utf8");
const originalLock = readFileSync(lockPath, "utf8");
const pkg = JSON.parse(originalPackage);
const version = explicitVersion ?? bumpVersion(latestVersion(), bump);
pkg.version = version;
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

try {
  run("npm", ["install", "--package-lock-only"]);
  run("npm", ["run", "test"]);
  run("npm", ["pack", "--workspace", "carto-kit", "--dry-run"]);
  run("npm", ["publish", "--workspace", "carto-kit", "--access", "public", "--dry-run"]);
  if (publish) {
    run("npm", ["whoami"]);
    const publishArgs = ["publish", "--workspace", "carto-kit", "--access", "public"];
    if (otp) publishArgs.push("--otp", otp);
    run("npm", publishArgs);
    run("npm", ["view", `carto-kit@${version}`, "dist.tarball"]);
    console.log(`Published carto-kit@${version}.`);
  } else {
    console.log(`Dry run complete for carto-kit@${version}.`);
  }
} finally {
  if (!publish) {
    writeFileSync(packagePath, originalPackage);
    writeFileSync(lockPath, originalLock);
  }
}

function latestVersion() {
  const result = spawnSync("npm", ["view", "carto-kit", "version"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) fail(result.stderr.trim() || "Unable to read the published carto-kit version.");
  return result.stdout.trim();
}

function bumpVersion(value, kind) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) fail(`Cannot bump version ${value}.`);
  let [, major, minor, patch] = match.map(Number);
  if (kind === "major") { major += 1; minor = 0; patch = 0; }
  else if (kind === "minor") { minor += 1; patch = 0; }
  else patch += 1;
  return `${major}.${minor}.${patch}`;
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
