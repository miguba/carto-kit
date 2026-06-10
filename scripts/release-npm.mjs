#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cartoPkgPath = resolve(rootDir, "packages/carto-kit/package.json");
const createPkgPath = resolve(rootDir, "packages/create-carto-wrapper/package.json");
const rootLockPath = resolve(rootDir, "package-lock.json");
const publishVerifyAttempts = 12;
const publishVerifyDelayMs = 5000;
const releaseRelevantPaths = [
  "templates",
  "packages/carto-kit/src",
  "packages/carto-kit/scripts/copy-template.mjs",
  "packages/create-carto-wrapper/cli.js",
];

const args = process.argv.slice(2);
const options = {
  publish: false,
  bump: undefined,
  force: false,
  skipTests: false,
  skipBuild: false,
  skipInstallCheck: false,
  otp: undefined,
};

let version;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === "--publish") {
    options.publish = true;
  } else if (arg === "--dry-run") {
    options.publish = false;
  } else if (arg === "--force") {
    options.force = true;
  } else if (arg === "--patch" || arg === "--minor" || arg === "--major") {
    if (version || options.bump) {
      fail("Pass either one explicit version or one bump flag.");
    }
    options.bump = arg.slice(2);
  } else if (arg === "--skip-tests") {
    options.skipTests = true;
  } else if (arg === "--skip-build") {
    options.skipBuild = true;
  } else if (arg === "--skip-install-check") {
    options.skipInstallCheck = true;
  } else if (arg === "--otp") {
    if (!args[index + 1] || args[index + 1].startsWith("-")) {
      fail("--otp requires a one-time password value.");
    }
    options.otp = args[index + 1];
    index += 1;
  } else if (arg.startsWith("--otp=")) {
    options.otp = arg.slice("--otp=".length);
    if (!options.otp) {
      fail("--otp requires a one-time password value.");
    }
  } else if (arg === "-h" || arg === "--help") {
    printUsage();
    process.exit(0);
  } else if (!arg.startsWith("-") && !version && !options.bump) {
    version = arg;
  } else {
    fail(`Unknown argument: ${arg}`);
  }
}

if (!version) {
  if (!options.bump) {
    printUsage();
    fail("Missing target version. Pass a version or use --patch, --minor, or --major.");
  }
  version = resolveNextVersion(options.bump);
}

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  fail(`Invalid version "${version}". Use a semver value like 0.1.6.`);
}

if (!existsSync(cartoPkgPath) || !existsSync(createPkgPath)) {
  fail("Expected package files were not found. Run this from the Carto repo root.");
}

main();

function main() {
  log(`Preparing ${options.publish ? "npm release" : "npm release dry run"} for ${version}`);
  const restoreDryRunFiles = options.publish ? undefined : createDryRunRestore();
  if (restoreDryRunFiles) {
    process.on("exit", restoreDryRunFiles);
  }

  const cartoPkg = readJson(cartoPkgPath);
  const createPkg = readJson(createPkgPath);
  const previousCartoVersion = cartoPkg.version;
  const previousCreateVersion = createPkg.version;
  const previousCreateDependency = createPkg.dependencies?.["carto-kit"];

  log(
    `Current versions: carto-kit=${previousCartoVersion}, create-carto=${previousCreateVersion}, create-carto dependency=${previousCreateDependency}`,
  );

  const packageStatus = {
    cartoKit: getPublishedStatus("carto-kit", version),
    createCarto: getPublishedStatus("create-carto", version),
  };
  validatePublishStatus(packageStatus);
  assertReleaseHasSourceChanges(packageStatus);

  updateVersions(cartoPkg, createPkg);

  run("npm", ["install", "--package-lock-only"]);

  if (!options.skipTests) {
    run("npm", ["run", "test"]);
  } else {
    log("Skipping tests because --skip-tests was passed.");
  }

  if (!options.skipBuild) {
    run("npm", ["run", "build"]);
  } else {
    log("Skipping build because --skip-build was passed.");
  }

  run("npm", ["pack", "--workspace", "carto-kit", "--dry-run"]);
  run("npm", ["pack", "--workspace", "create-carto", "--dry-run"]);
  if (!packageStatus.cartoKit.published) {
    run("npm", ["publish", "--workspace", "carto-kit", "--access", "public", "--dry-run"]);
  } else {
    log(`Skipping carto-kit publish dry run because carto-kit@${version} is already published.`);
  }

  if (!packageStatus.createCarto.published) {
    run("npm", ["publish", "--workspace", "create-carto", "--access", "public", "--dry-run"]);
  } else {
    log(`Skipping create-carto publish dry run because create-carto@${version} is already published.`);
  }

  if (!options.publish) {
    if (restoreDryRunFiles) {
      process.off("exit", restoreDryRunFiles);
      restoreDryRunFiles();
    }
    log("Dry run complete. Re-run with --publish to publish to npm.");
    return;
  }

  run("npm", ["whoami"]);

  const publishArgs = ["publish", "--access", "public"];
  if (options.otp) {
    publishArgs.push("--otp", options.otp);
  }

  if (!packageStatus.cartoKit.published) {
    run("npm", [...publishArgs, "--workspace", "carto-kit"]);
  } else {
    log(`Skipping carto-kit publish because carto-kit@${version} is already published.`);
  }

  if (!packageStatus.createCarto.published) {
    run("npm", [...publishArgs, "--workspace", "create-carto"]);
  } else {
    log(`Skipping create-carto publish because create-carto@${version} is already published.`);
  }

  waitForPublishedVersion("carto-kit", version);
  waitForPublishedVersion("create-carto", version);

  run("npm", ["view", "carto-kit", "dist-tags", "--json"]);
  run("npm", ["view", "create-carto", "dist-tags", "--json"]);

  if (!options.skipInstallCheck) {
    runInstallCheck();
  } else {
    log("Skipping clean install check because --skip-install-check was passed.");
  }

  log(`Published carto-kit@${version} and create-carto@${version}.`);
}

function updateVersions(cartoPkg, createPkg) {
  cartoPkg.version = version;
  createPkg.version = version;
  createPkg.dependencies = createPkg.dependencies ?? {};
  createPkg.dependencies["carto-kit"] = version;

  writeJson(cartoPkgPath, cartoPkg);
  writeJson(createPkgPath, createPkg);

  log(`Updated package versions to ${version}.`);
}

function createDryRunRestore() {
  const snapshots = [
    [cartoPkgPath, readFileSync(cartoPkgPath, "utf8")],
    [createPkgPath, readFileSync(createPkgPath, "utf8")],
  ];

  if (existsSync(rootLockPath)) {
    snapshots.push([rootLockPath, readFileSync(rootLockPath, "utf8")]);
  }

  let restored = false;
  return () => {
    if (restored) {
      return;
    }
    restored = true;
    for (const [path, contents] of snapshots) {
      writeFileSync(path, contents);
    }
  };
}

function resolveNextVersion(bumpType) {
  const localVersions = [
    readJson(cartoPkgPath).version,
    readJson(createPkgPath).version,
    readJson(createPkgPath).dependencies?.["carto-kit"],
  ].filter(Boolean);
  const publishedVersions = [
    getLatestPublishedVersion("carto-kit"),
    getLatestPublishedVersion("create-carto"),
  ].filter(Boolean);
  const baseVersion = maxVersion(publishedVersions);
  const localMaxVersion = maxVersion(localVersions);
  const nextVersion = bumpVersion(baseVersion, bumpType);

  if (compareVersions(localMaxVersion, baseVersion) > 0) {
    log(`Local package version ${localMaxVersion} is ahead of npm latest ${baseVersion}; auto-bump will use npm latest as the source of truth.`);
  }

  log(`Auto-detected npm latest version ${baseVersion}; using ${nextVersion}.`);
  return nextVersion;
}

function getLatestPublishedVersion(packageName) {
  const result = spawnSync("npm", ["view", packageName, "version"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    fail(`Could not read latest ${packageName} version from npm:\n${result.stderr.trim()}`);
  }

  return result.stdout.trim();
}

function maxVersion(versions) {
  const parsedVersions = versions.map(parseVersion).filter(Boolean);
  if (parsedVersions.length === 0) {
    fail("Could not find any local or published version to bump.");
  }

  parsedVersions.sort(compareParsedVersions);
  return parsedVersions.at(-1).raw;
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) {
    return undefined;
  }

  return {
    raw: value,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareParsedVersions(left, right) {
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  );
}

function compareVersions(left, right) {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);

  if (!parsedLeft || !parsedRight) {
    return 0;
  }

  return compareParsedVersions(parsedLeft, parsedRight);
}

function bumpVersion(baseVersion, bumpType) {
  const parsed = parseVersion(baseVersion);
  if (!parsed) {
    fail(`Cannot auto-bump non-standard version "${baseVersion}". Pass the target version explicitly.`);
  }

  if (bumpType === "major") {
    return `${parsed.major + 1}.0.0`;
  }

  if (bumpType === "minor") {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }

  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

function getPublishedStatus(packageName, packageVersion) {
  const result = spawnSync("npm", ["view", `${packageName}@${packageVersion}`, "version"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (result.status === 0) {
    log(`${packageName}@${packageVersion} is already published.`);
    return { packageName, packageVersion, published: true };
  }

  const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (!combinedOutput.includes("E404")) {
    fail(`Could not verify ${packageName}@${packageVersion} on npm:\n${combinedOutput.trim()}`);
  }

  log(`${packageName}@${packageVersion} is not published yet.`);
  return { packageName, packageVersion, published: false };
}

function waitForPublishedVersion(packageName, packageVersion) {
  for (let attempt = 1; attempt <= publishVerifyAttempts; attempt += 1) {
    const status = getPackageVersionStatus(packageName, packageVersion);

    if (status.published && status.tarball) {
      log(`${packageName}@${packageVersion} is visible on npm: ${status.tarball}`);
      return;
    }

    if (attempt < publishVerifyAttempts) {
      log(`Waiting for ${packageName}@${packageVersion} to propagate on npm (${attempt}/${publishVerifyAttempts})...`);
      sleep(publishVerifyDelayMs);
    }
  }

  fail(
    `${packageName}@${packageVersion} is not visible on npm after ${publishVerifyAttempts} checks. ` +
      `This can be registry propagation delay or an incomplete publish. Re-run the same publish command to resume missing packages.`,
  );
}

function getPackageVersionStatus(packageName, packageVersion) {
  const versionResult = spawnSync("npm", ["view", `${packageName}@${packageVersion}`, "version"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (versionResult.status !== 0) {
    return { published: false, tarball: undefined };
  }

  const tarballResult = spawnSync("npm", ["view", `${packageName}@${packageVersion}`, "dist.tarball"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (tarballResult.status !== 0) {
    return { published: true, tarball: undefined };
  }

  return { published: true, tarball: tarballResult.stdout.trim() };
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function validatePublishStatus(packageStatus) {
  const cartoPublished = packageStatus.cartoKit.published;
  const createPublished = packageStatus.createCarto.published;

  if (!options.publish && (cartoPublished || createPublished)) {
    fail(`Version ${version} already exists on npm. Choose a new version for a dry run.`);
  }

  if (options.publish && cartoPublished && createPublished) {
    fail(`Both carto-kit@${version} and create-carto@${version} are already published.`);
  }

  if (options.publish && !cartoPublished && createPublished) {
    fail(`create-carto@${version} already exists but carto-kit@${version} does not. Refusing inconsistent release.`);
  }
}

function assertReleaseHasSourceChanges(packageStatus) {
  if (!options.publish || options.force) {
    return;
  }

  const isResumingIncompleteRelease =
    packageStatus.cartoKit.published !== packageStatus.createCarto.published;
  if (isResumingIncompleteRelease) {
    log("Incomplete npm release detected; allowing publish to resume the missing package.");
    return;
  }

  const result = spawnSync("git", ["status", "--porcelain", "--", ...releaseRelevantPaths], {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    fail(`Could not check release source changes:\n${result.stderr.trim()}`);
  }

  if (!result.stdout.trim()) {
    fail(
      "No release-relevant source changes found. Refusing to publish an empty version.\n" +
        `Checked paths: ${releaseRelevantPaths.join(", ")}\n` +
        "Use --force only if you intentionally need to publish a version without source changes.",
    );
  }

  log("Release-relevant source changes detected.");
}

function runInstallCheck() {
  const tmpResult = spawnSync("mktemp", ["-d"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (tmpResult.status !== 0) {
    fail(`Failed to create temp directory:\n${tmpResult.stderr}`);
  }

  const tmpDir = tmpResult.stdout.trim();
  run("npm", ["init", "-y"], { cwd: tmpDir });
  run("npm", ["install", `carto-kit@${version}`], { cwd: tmpDir });
}

function run(command, commandArgs, { cwd = rootDir } = {}) {
  log(`$ ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function printUsage() {
  console.log(`Usage:
  npm run release:npm -- <version> [--dry-run]
  npm run release:npm -- <version> --publish [--otp 123456]
  npm run release:npm -- --patch [--dry-run]
  npm run release:npm -- --patch --publish [--otp 123456]

Options:
  --publish             Actually publish both npm packages. Default is dry run.
  --dry-run             Run all checks and npm publish dry runs without publishing.
  --force               Allow publishing even when no release-relevant source changes are detected.
  --patch               Auto-detect the latest version and bump the patch version.
  --minor               Auto-detect the latest version and bump the minor version.
  --major               Auto-detect the latest version and bump the major version.
  --otp <code>          Pass an npm 2FA one-time password to publish commands.
  --skip-tests          Skip npm run test.
  --skip-build          Skip npm run build.
  --skip-install-check  Skip clean npm install verification after publishing.
`);
}

function log(message) {
  console.log(`\n[release:npm] ${message}`);
}

function fail(message) {
  console.error(`\n[release:npm] ${message}`);
  process.exit(1);
}
