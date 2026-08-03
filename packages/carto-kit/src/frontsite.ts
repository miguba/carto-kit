import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { resolve, relative } from "node:path";
import { CONTRACT_BUNDLE_PATH, validateContractBundle, type ContractBundle as VersionedContractBundle } from "./contract.js";
import { hasPrivateToken } from "./secrets.js";

export const REPORT_SCHEMA_VERSION = "carto.frontsite.report.v1";

export type Severity = "info" | "warning" | "error" | "blocked";
export type Gate = "environment" | "project" | "connection" | "contract" | "safety" | "functional" | "engineering" | "visual";

export interface Finding {
  severity: Severity;
  code: string;
  message: string;
  path: string | null;
  remediation: string | null;
  evidence: Record<string, unknown>;
}

export interface GateResult {
  gate: Gate;
  status: "passed" | "warning" | "failed" | "blocked";
  findings: Finding[];
}

export interface FrontsiteReport {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  command: "doctor" | "verify";
  ok: boolean;
  generatedAt: string;
  projectRoot: string;
  gates: GateResult[];
  summary: Record<"passed" | "warning" | "failed" | "blocked", number>;
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface ContractRequirement {
  id?: unknown;
  category?: unknown;
  description?: unknown;
}

export async function doctorFrontsite(projectRoot: string): Promise<FrontsiteReport> {
  const gates: GateResult[] = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  gates.push(gate("environment", [
    nodeMajor >= 20
      ? finding("info", "ENV_NODE_SUPPORTED", `Node.js ${process.versions.node} is supported.`, undefined, undefined, { minimumMajor: 20, actual: process.versions.node })
      : finding("error", "ENV_NODE_UNSUPPORTED", `Node.js ${process.versions.node} is unsupported.`, undefined, "Install Node.js 20 or newer.", { minimumMajor: 20, actual: process.versions.node }),
    ...await requiredEnvironmentFindings(projectRoot)
  ]));

  const pkg = await readPackage(projectRoot);
  const config = await readJson(resolve(projectRoot, "carto.config.json"));
  const projectFindings: Finding[] = [];
  if (pkg.ok) projectFindings.push(finding("info", "PROJECT_PACKAGE_VALID", "package.json is valid JSON.", "package.json"));
  else projectFindings.push(finding("error", "PROJECT_PACKAGE_INVALID", pkg.error, "package.json", "Run doctor from a frontsite root with a valid package.json."));
  if (config.ok) projectFindings.push(finding("info", "PROJECT_CONFIG_VALID", "carto.config.json is valid JSON.", "carto.config.json"));
  else projectFindings.push(finding(config.missing ? "warning" : "error", config.missing ? "PROJECT_CONFIG_MISSING" : "PROJECT_CONFIG_INVALID", config.error, "carto.config.json", "Add or repair carto.config.json."));
  gates.push(gate("project", projectFindings));

  gates.push(gate("connection", await connectionFindings()));
  gates.push(gate("contract", await contractCapabilityFindings(projectRoot)));
  return report("doctor", projectRoot, gates);
}

export async function verifyFrontsite(projectRoot: string): Promise<FrontsiteReport> {
  const pkgResult = await readPackage(projectRoot);
  const pkg = pkgResult.ok ? pkgResult.value : {};
  const gates: GateResult[] = [];
  gates.push(gate("contract", await verifyContract(projectRoot)));
  gates.push(gate("safety", await verifySafety(projectRoot)));
  gates.push(gate("functional", await verifyScriptGate(projectRoot, pkg, "functional", ["verify:functional"], "FUNCTIONAL_NOT_CONFIGURED", "Add a verify:functional script that exercises the storefront without real charges.")));
  gates.push(gate("engineering", await verifyEngineering(projectRoot, pkg)));
  gates.push(gate("visual", await verifyVisual(projectRoot, pkg)));
  return report("verify", projectRoot, gates);
}

async function requiredEnvironmentFindings(root: string): Promise<Finding[]> {
  const connected = await hasPrivateToken(root);
  return [connected
    ? finding("info", "AUTH_CREDENTIAL_STORED", "A project credential is stored.", undefined, undefined, { present: true })
    : finding("warning", "AUTH_CREDENTIAL_MISSING", "No project credential is stored.", undefined, "Run carto connect.", { present: false })];
}

async function connectionFindings(): Promise<Finding[]> {
  const url = process.env.CARTO_COMMERCE_HEALTHCHECK_URL?.trim();
  if (!url) return [finding("blocked", "CONNECTION_HEALTHCHECK_UNAVAILABLE", "No public commerce health-check URL is configured.", undefined, "Set CARTO_COMMERCE_HEALTHCHECK_URL to an unauthenticated HTTP(S) health endpoint.")];
  let parsed: URL;
  try { parsed = new URL(url); } catch { return [finding("error", "CONNECTION_URL_INVALID", "CARTO_COMMERCE_HEALTHCHECK_URL is not a valid URL.")]; }
  if (!/^https?:$/.test(parsed.protocol)) return [finding("error", "CONNECTION_URL_UNSAFE", "Health-check URL must use HTTP or HTTPS.")];
  try {
    const response = await fetch(parsed, { method: "GET", signal: AbortSignal.timeout(5000), redirect: "manual" });
    const evidence = { origin: parsed.origin, status: response.status };
    return response.ok
      ? [finding("info", "CONNECTION_HEALTHCHECK_OK", "Commerce health check responded successfully.", undefined, undefined, evidence)]
      : [finding("error", "CONNECTION_HEALTHCHECK_FAILED", `Commerce health check returned HTTP ${response.status}.`, undefined, "Check the public health endpoint and network access.", evidence)];
  } catch (error) {
    return [finding("error", "CONNECTION_HEALTHCHECK_FAILED", "Commerce health check could not be reached.", undefined, "Check the public health endpoint and network access.", { origin: parsed.origin, error: safeError(error) })];
  }
}

async function contractCapabilityFindings(root: string): Promise<Finding[]> {
  return await exists(resolve(root, CONTRACT_BUNDLE_PATH))
    ? [finding("info", "CONTRACT_BUNDLE_DETECTED", "Contract Bundle is available.", CONTRACT_BUNDLE_PATH)]
    : [finding("blocked", "CONTRACT_BUNDLE_UNAVAILABLE", "Contract Bundle capability is unavailable.", CONTRACT_BUNDLE_PATH, "Run carto contract pull.")];
}

async function verifyContract(root: string): Promise<Finding[]> {
  const path = resolve(root, CONTRACT_BUNDLE_PATH);
  const result = await readJson(path);
  if (!result.ok) return [finding(result.missing ? "blocked" : "error", result.missing ? "CONTRACT_BUNDLE_UNAVAILABLE" : "CONTRACT_BUNDLE_INVALID_JSON", result.error, CONTRACT_BUNDLE_PATH, "Run carto contract pull; verification cannot infer private contracts.")];
  const findings: Finding[] = [];
  let value: VersionedContractBundle;
  try { value = validateContractBundle(result.value); }
  catch (error) { return [finding("error", "CONTRACT_BUNDLE_INVALID", safeError(error), CONTRACT_BUNDLE_PATH, "Pull a compatible public Contract Bundle.")]; }
  const verification = value.bundle.verification;
  const requirements = typeof verification === "object" && verification !== null && !Array.isArray(verification)
    ? (verification as Record<string, unknown>).requirements
    : undefined;
  if (!Array.isArray(requirements)) findings.push(finding("error", "CONTRACT_REQUIREMENTS_INVALID", "Contract Bundle bundle.verification.requirements must be an array.", CONTRACT_BUNDLE_PATH));
  else {
    const categories = new Set(["contract", "safety", "functional", "engineering", "visual"]);
    const ids = new Set<string>();
    requirements.forEach((raw, index) => {
      const requirement = raw as ContractRequirement;
      const itemPath = `${CONTRACT_BUNDLE_PATH}#/bundle/verification/requirements/${index}`;
      if (!requirement || typeof requirement !== "object" || typeof requirement.id !== "string" || !requirement.id.trim() || typeof requirement.description !== "string" || !categories.has(String(requirement.category))) {
        findings.push(finding("error", "CONTRACT_REQUIREMENT_INVALID", "Requirement must have a non-empty id, a supported category, and a description.", itemPath, "Use category contract, safety, functional, engineering, or visual."));
      } else if (ids.has(requirement.id)) {
        findings.push(finding("error", "CONTRACT_REQUIREMENT_DUPLICATE", `Requirement id ${requirement.id} is duplicated.`, itemPath, "Use a unique stable id for every requirement.", { id: requirement.id }));
      } else ids.add(requirement.id);
    });
    if (!findings.some((item) => item.severity === "error")) findings.push(finding("info", "CONTRACT_BUNDLE_VALID", "Contract Bundle structure is valid.", CONTRACT_BUNDLE_PATH, undefined, { requirementCount: requirements.length, schemaVersion: value.schemaVersion, contractVersion: value.contractVersion }));
  }
  return findings;
}

async function verifySafety(root: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const gitignore = await readText(resolve(root, ".gitignore"));
  const protectsEnv = gitignore.ok && gitignore.value.split(/\r?\n/).some((line) => /^\.env(?:\*|$)/.test(line.trim()));
  findings.push(protectsEnv
    ? finding("info", "SAFETY_ENV_IGNORED", ".gitignore protects environment files.", ".gitignore")
    : finding("error", "SAFETY_ENV_NOT_IGNORED", ".gitignore does not clearly protect .env files.", ".gitignore", "Add .env and .env.* rules, with explicit sample-file exceptions if needed."));
  const tracked = await capture("git", ["ls-files", "--", ".env", ".env.*"], root);
  if (tracked.code === 0) {
    const paths = tracked.stdout.split(/\r?\n/).filter(Boolean).filter((path) => !/\.(?:example|sample|template)$/.test(path));
    findings.push(paths.length === 0
      ? finding("info", "SAFETY_NO_TRACKED_ENV", "No environment secret files are tracked by git.")
      : finding("error", "SAFETY_TRACKED_ENV", "Potential environment secret files are tracked by git.", paths[0], "Remove secret-bearing environment files from version control and rotate exposed credentials.", { paths }));
  } else findings.push(finding("blocked", "SAFETY_GIT_UNAVAILABLE", "Could not inspect tracked environment filenames.", undefined, "Run verification in a git worktree.", { exitCode: tracked.code }));
  return findings;
}

async function verifyEngineering(root: string, pkg: PackageJson): Promise<Finding[]> {
  const available = ["typecheck", "check", "test", "build"].filter((name, index, all) => pkg.scripts?.[name] && (name !== "check" || !pkg.scripts?.typecheck) && all.indexOf(name) === index);
  if (available.length === 0) return [finding("blocked", "ENGINEERING_NOT_CONFIGURED", "No typecheck/check, test, or build scripts are configured.", "package.json", "Add engineering scripts to package.json.")];
  const findings: Finding[] = [];
  for (const script of available) findings.push(await runPackageScript(root, script, "ENGINEERING"));
  return findings;
}

async function verifyVisual(root: string, pkg: PackageJson): Promise<Finding[]> {
  const scripts = pkg.scripts ?? {};
  const findings: Finding[] = [];
  for (const viewport of ["desktop", "mobile"] as const) {
    const script = `verify:visual:${viewport}`;
    if (!scripts[script]) findings.push(finding("blocked", `VISUAL_${viewport.toUpperCase()}_UNAVAILABLE`, `No ${viewport} visual verification capability is configured.`, "package.json", `Add a ${script} script that produces real browser evidence.`));
    else findings.push(await runPackageScript(root, script, `VISUAL_${viewport.toUpperCase()}`));
  }
  return findings;
}

async function verifyScriptGate(root: string, pkg: PackageJson, _gateName: Gate, scripts: string[], blockedCode: string, remediation: string): Promise<Finding[]> {
  const script = scripts.find((name) => pkg.scripts?.[name]);
  return script ? [await runPackageScript(root, script, "FUNCTIONAL")] : [finding("blocked", blockedCode, "No functional verification capability is configured.", "package.json", remediation)];
}

async function runPackageScript(root: string, script: string, prefix: string): Promise<Finding> {
  const result = await runSilent(process.platform === "win32" ? "npm.cmd" : "npm", ["run", script], root);
  // Command output is deliberately not included: verification scripts can receive
  // credentials and their stdout/stderr is not safe report material.
  const evidence = { command: `npm run ${script}`, exitCode: result.code, signal: result.signal };
  return result.code === 0
    ? finding("info", `${prefix}_COMMAND_PASSED`, `${script} passed.`, "package.json", undefined, evidence)
    : finding("error", `${prefix}_COMMAND_FAILED`, `${script} failed.`, "package.json", `Run npm run ${script} and fix the reported failures.`, evidence);
}

function report(command: "doctor" | "verify", projectRoot: string, gates: GateResult[]): FrontsiteReport {
  const summary = { passed: 0, warning: 0, failed: 0, blocked: 0 };
  for (const item of gates) summary[item.status]++;
  return { schemaVersion: REPORT_SCHEMA_VERSION, command, ok: summary.failed === 0 && summary.blocked === 0, generatedAt: new Date().toISOString(), projectRoot: resolve(projectRoot), gates, summary };
}

function gate(name: Gate, findings: Finding[]): GateResult {
  const severities = new Set(findings.map((item) => item.severity));
  const status = severities.has("error") ? "failed" : severities.has("blocked") ? "blocked" : severities.has("warning") ? "warning" : "passed";
  return { gate: name, status, findings };
}

function finding(severity: Severity, code: string, message: string, path?: string, remediation?: string, evidence?: Record<string, unknown>): Finding {
  return { severity, code, message, path: path ?? null, remediation: remediation ?? null, evidence: evidence ?? {} };
}

async function readPackage(root: string): Promise<{ ok: true; value: PackageJson } | { ok: false; error: string }> {
  const result = await readJson(resolve(root, "package.json"));
  return result.ok ? { ok: true, value: result.value as PackageJson } : { ok: false, error: result.error };
}

async function readJson(path: string): Promise<{ ok: true; value: unknown } | { ok: false; error: string; missing: boolean }> {
  try { return { ok: true, value: JSON.parse(await readFile(path, "utf8")) }; }
  catch (error) { const missing = (error as NodeJS.ErrnoException).code === "ENOENT"; return { ok: false, missing, error: missing ? `${relative(process.cwd(), path) || path} is missing.` : `Invalid JSON: ${safeError(error)}` }; }
}

async function readText(path: string): Promise<{ ok: true; value: string } | { ok: false }> {
  try { return { ok: true, value: await readFile(path, "utf8") }; } catch { return { ok: false }; }
}

async function exists(path: string): Promise<boolean> { try { await access(path, constants.F_OK); return true; } catch { return false; } }

async function capture(command: string, args: string[], cwd: string): Promise<{ code: number; signal: string | null; stdout: string; outputTail: string }> {
  return await new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd, env: process.env, shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let combined = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); combined += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { combined += chunk.toString(); });
    child.once("error", (error) => resolvePromise({ code: 127, signal: null, stdout, outputTail: safeError(error) }));
    child.once("exit", (code, signal) => resolvePromise({ code: code ?? 1, signal, stdout, outputTail: combined.slice(-4000) }));
  });
}

async function runSilent(command: string, args: string[], cwd: string): Promise<{ code: number; signal: string | null }> {
  return await new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd, env: process.env, shell: process.platform === "win32", stdio: "ignore" });
    child.once("error", () => resolvePromise({ code: 127, signal: null }));
    child.once("exit", (code, signal) => resolvePromise({ code: code ?? 1, signal }));
  });
}

function safeError(error: unknown): string { return error instanceof Error ? error.message : String(error); }
