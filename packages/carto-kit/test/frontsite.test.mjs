import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const cli = resolve("dist/cli.js");

async function fixture({ complete = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "carto-frontsite-"));
  const scripts = complete ? {
    "verify:functional": "node -e \"process.exit(0)\"",
    "typecheck": "node -e \"process.exit(0)\"",
    "test": "node -e \"process.exit(0)\"",
    "build": "node -e \"process.exit(0)\"",
    "verify:visual:desktop": "node -e \"process.exit(0)\"",
    "verify:visual:mobile": "node -e \"process.exit(0)\""
  } : {};
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", scripts }));
  await writeFile(join(root, "carto.config.json"), JSON.stringify({ schemaVersion: 1, deployment: { provider: "cloudflare-workers" } }));
  if (complete) {
    await mkdir(join(root, ".carto", "contracts"), { recursive: true });
    await writeFile(join(root, ".carto", "contracts", "bundle.json"), JSON.stringify({ schemaVersion: "1.0.0", contractVersion: "1.0.0", bundle: { verification: { requirements: [] } } }));
    await writeFile(join(root, ".gitignore"), ".env\n.env.*\n!.env.example\n");
    spawnSync("git", ["init", "-q"], { cwd: root });
  }
  return root;
}

function run(root, command) {
  const result = spawnSync(process.execPath, [cli, "frontsite", command, "--json"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, COMMERCE_API_TOKEN: "test-secret", CARTO_COMMERCE_HEALTHCHECK_URL: "" }
  });
  const envelope = JSON.parse(result.stdout);
  return { ...result, envelope, json: envelope.data.report };
}

test("doctor emits a versioned report and blocks unavailable capabilities", async () => {
  const result = run(await fixture(), "doctor");
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.equal(result.json.schemaVersion, "carto.frontsite.report.v1");
  assert.equal(result.json.command, "doctor");
  assert.equal(result.json.ok, false);
  assert.equal(result.envelope.ok, false);
  assert.ok(result.json.gates.some((gate) => gate.gate === "connection" && gate.status === "blocked"));
  assert.ok(result.json.gates.some((gate) => gate.gate === "contract" && gate.status === "blocked"));
  assert.ok(!result.stdout.includes("test-secret"));
});

test("verify passes only when every real configured gate command passes", async () => {
  const result = run(await fixture({ complete: true }), "verify");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.envelope.ok, true);
  assert.deepEqual(result.json.gates.map((gate) => gate.gate), ["contract", "safety", "functional", "engineering", "visual"]);
  assert.ok(result.json.gates.every((gate) => gate.status === "passed"));
  for (const gate of result.json.gates) for (const finding of gate.findings) {
    assert.equal(typeof finding.severity, "string");
    assert.equal(typeof finding.code, "string");
    assert.equal(typeof finding.message, "string");
  }
  assert.ok(!result.stdout.includes("test-secret"));
});

test("verify returns non-zero and blocked findings when capabilities are absent", async () => {
  const result = run(await fixture(), "verify");
  assert.equal(result.status, 1);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.gates.find((gate) => gate.gate === "contract").status, "blocked");
  assert.equal(result.json.gates.find((gate) => gate.gate === "functional").status, "blocked");
  assert.equal(result.json.gates.find((gate) => gate.gate === "visual").status, "blocked");
});

test("verify reports a real failing command without copying its output", async () => {
  const root = await fixture({ complete: true });
  const pkg = JSON.parse(await (await import("node:fs/promises")).readFile(join(root, "package.json"), "utf8"));
  pkg.scripts["verify:functional"] = "node -e \"console.error(process.env.COMMERCE_API_TOKEN); process.exit(7)\"";
  await writeFile(join(root, "package.json"), JSON.stringify(pkg));
  const result = run(root, "verify");
  const functional = result.json.gates.find((gate) => gate.gate === "functional");
  assert.equal(result.status, 1);
  assert.equal(functional.status, "failed");
  assert.equal(functional.findings[0].evidence.exitCode, 7);
  assert.ok(!result.stdout.includes("test-secret"));
});
