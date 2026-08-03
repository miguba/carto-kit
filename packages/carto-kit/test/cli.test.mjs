import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const cli = resolve("dist/cli.js");

test("--json emits one versioned usage error on stdout and diagnostics stay empty", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "carto-cli-"));
  let failure;
  try {
    await execFileAsync(process.execPath, [cli, "unknown", "--json"], { cwd });
  } catch (error) { failure = error; }
  assert.equal(failure.code, 2);
  assert.equal(failure.stderr, "");
  const lines = failure.stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    version: 1,
    ok: false,
    command: "unknown",
    error: {
      code: "USAGE_ERROR",
      message: "Unknown command \"unknown\". Run carto --help for usage.",
      retryable: false
    }
  });
});

test("connect without a published API base fails with a stable configuration result", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "carto-cli-"));
  let failure;
  try {
    await execFileAsync(process.execPath, [cli, "connect", "--json", "--no-browser"], {
      cwd,
      env: { ...process.env, CARTO_PRIVATE_API_URL: "" }
    });
  } catch (error) { failure = error; }
  assert.equal(failure.code, 3);
  const result = JSON.parse(failure.stdout);
  assert.equal(result.version, 1);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "CONFIG_INVALID");
});
