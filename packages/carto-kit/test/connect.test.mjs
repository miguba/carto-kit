import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { connectPrivate } from "../dist/connect.js";
import { createOutput } from "../dist/output.js";

test("connect stores the credential without returning it and is idempotent", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "carto-connect-"));
  const credential = `private-${crypto.randomUUID()}`;
  let requests = 0;
  const fetch = async (input, init) => {
    requests += 1;
    const path = new URL(input).pathname;
    if (path.endsWith("authorizations")) {
      assert.equal(init.headers["content-type"], "application/json");
      assert.equal(init.body, "{}");
      return Response.json({
        deviceCode: "device-secret",
        userCode: "ABCD-EFGH",
        verificationUri: "https://private.example/activate",
        expiresIn: 20,
        interval: 0
      });
    }
    return Response.json({ status: "approved", token: credential });
  };
  const output = { ...createOutput(true), diagnostic() {} };
  const result = await connectPrivate(projectDir, {
    apiUrl: "https://api.example",
    fetch,
    noBrowser: true,
    output
  });
  assert.deepEqual(result, { status: "connected", changed: true, credential: "stored" });
  assert.equal(JSON.stringify(result).includes(credential), false);
  const secretPath = join(projectDir, ".carto/secrets.json");
  assert.equal(JSON.parse(await readFile(secretPath, "utf8")).cartoPrivate.token, credential);
  if (process.platform !== "win32") assert.equal((await stat(secretPath)).mode & 0o777, 0o600);
  assert.match(await readFile(join(projectDir, ".gitignore"), "utf8"), /^\.carto\/secrets\.json$/m);

  const again = await connectPrivate(projectDir, { apiUrl: "https://api.example", fetch, noBrowser: true, output });
  assert.deepEqual(again, { status: "connected", changed: false, credential: "stored" });
  assert.equal(requests, 2);
});

test("service errors expose only safe request metadata", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "carto-connect-"));
  await assert.rejects(
    connectPrivate(projectDir, {
      apiUrl: "https://api.example",
      fetch: async () => new Response("sensitive upstream body", {
        status: 503,
        headers: { "x-request-id": "request-123" }
      }),
      noBrowser: true,
      output: createOutput(true)
    }),
    (error) => {
      assert.equal(error.code, "SERVICE_ERROR");
      assert.equal(error.exitCode, 11);
      assert.equal(error.retryable, true);
      assert.deepEqual(error.details, { requestId: "request-123" });
      assert.equal(error.message.includes("sensitive"), false);
      return true;
    }
  );
});

test("an external abort cancels polling with the stable auth exit code", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "carto-connect-"));
  const controller = new AbortController();
  const fetch = async () => Response.json({
    deviceCode: "device-secret",
    userCode: "ABCD-EFGH",
    verificationUri: "https://private.example/activate",
    expiresIn: 20,
    interval: 10
  });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(
    connectPrivate(projectDir, {
      apiUrl: "https://api.example",
      fetch,
      noBrowser: true,
      signal: controller.signal,
      output: { ...createOutput(true), diagnostic() {} }
    }),
    (error) => error.code === "AUTH_CANCELLED" && error.exitCode === 5
  );
});
