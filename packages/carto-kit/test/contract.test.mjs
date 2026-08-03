import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { ContractError, pullContractBundle, validateContractBundle } from "../dist/contract.js";
import { savePrivateToken } from "../dist/secrets.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/contract-bundle-v1.json", import.meta.url), "utf8"));

test("accepts v1 additive fields and rejects unsupported major", () => {
  assert.equal(validateContractBundle(fixture).additiveField, "accepted");
  assert.throws(() => validateContractBundle({ ...fixture, schemaVersion: "2.0.0" }), (error) => error instanceof ContractError && error.code === "UNSUPPORTED_SCHEMA_VERSION");
});

test("pull writes the deterministic project path and offline reuses it", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "carto-contract-"));
  await savePrivateToken(root, "test-token");
  const online = await pullContractBundle(root, { endpoint: "https://private.example/v1/contracts/bundle", fetch: async () => new Response(JSON.stringify(fixture)) });
  assert.equal(online.source, "remote");
  assert.equal(online.path, resolve(root, ".carto/contracts/bundle.json"));
  assert.deepEqual(JSON.parse(await readFile(online.path, "utf8")), fixture);
  const offline = await pullContractBundle(root, { offline: true });
  assert.equal(offline.source, "cache");
});

test("a corrupt cache is replaced by a valid remote bundle", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "carto-contract-"));
  await savePrivateToken(root, "test-token");
  await mkdir(resolve(root, ".carto/contracts"), { recursive: true });
  await writeFile(resolve(root, ".carto/contracts/bundle.json"), "not-json");
  const result = await pullContractBundle(root, { endpoint: "https://private.example/v1/contracts/bundle", fetch: async () => new Response(JSON.stringify(fixture)) });
  assert.equal(result.source, "remote");
  assert.deepEqual(JSON.parse(await readFile(result.path, "utf8")), fixture);
});

test("missing endpoint fails explicitly and never fabricates a bundle", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "carto-contract-"));
  await savePrivateToken(root, "test-token");
  await assert.rejects(pullContractBundle(root), (error) => error instanceof ContractError && error.code === "CAPABILITY_UNAVAILABLE" && error.exitCode === 12);
});

test("allows HTTP only for versioned loopback development endpoints", async () => {
  const localRoot = await mkdtemp(resolve(tmpdir(), "carto-contract-"));
  await savePrivateToken(localRoot, "test-token");
  const local = await pullContractBundle(localRoot, {
    endpoint: "http://localhost:3000/api/v1/frontsite/contract-bundle",
    fetch: async () => new Response(JSON.stringify(fixture))
  });
  assert.equal(local.source, "remote");

  const remoteRoot = await mkdtemp(resolve(tmpdir(), "carto-contract-"));
  await savePrivateToken(remoteRoot, "test-token");
  await assert.rejects(
    pullContractBundle(remoteRoot, { endpoint: "http://private.example/api/v1/frontsite/contract-bundle", fetch: async () => new Response(JSON.stringify(fixture)) }),
    (error) => error instanceof ContractError && error.code === "CAPABILITY_UNAVAILABLE"
  );
});

test("network failure falls back only to a valid cache", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "carto-contract-"));
  await savePrivateToken(root, "test-token");
  await pullContractBundle(root, { endpoint: "https://private.example/v1/contracts/bundle", fetch: async () => new Response(JSON.stringify(fixture)) });
  const result = await pullContractBundle(root, { endpoint: "https://private.example/v1/contracts/bundle", fetch: async () => { throw new Error("offline"); } });
  assert.equal(result.source, "cache");
});

test("uses ETag for conditional requests and accepts 304", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "carto-contract-"));
  await savePrivateToken(root, "test-token");
  await pullContractBundle(root, {
    endpoint: "https://private.example/v1/contracts/bundle",
    fetch: async () => new Response(JSON.stringify(fixture), { headers: { etag: '"bundle-v1"' } })
  });
  let conditional;
  const result = await pullContractBundle(root, {
    endpoint: "https://private.example/v1/contracts/bundle",
    fetch: async (_url, init) => {
      conditional = init.headers["if-none-match"];
      return new Response(null, { status: 304 });
    }
  });
  assert.equal(conditional, '"bundle-v1"');
  assert.equal(result.source, "cache");
});

test("distinguishes authentication and scope errors with request IDs", async () => {
  for (const [status, code] of [[401, "AUTH_REQUIRED"], [403, "AUTH_FORBIDDEN"]]) {
    const root = await mkdtemp(resolve(tmpdir(), "carto-contract-"));
    await savePrivateToken(root, "test-token");
    await assert.rejects(
      pullContractBundle(root, { endpoint: "https://private.example/v1/contracts/bundle", fetch: async () => new Response(null, { status, headers: { "x-request-id": "req-safe" } }) }),
      (error) => error.code === code && error.details.requestId === "req-safe"
    );
  }
});

test("honors Retry-After with bounded retries", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "carto-contract-"));
  await savePrivateToken(root, "test-token");
  const waits = [];
  let attempts = 0;
  await assert.rejects(
    pullContractBundle(root, {
      endpoint: "https://private.example/v1/contracts/bundle",
      fetch: async () => { attempts++; return new Response(null, { status: 429, headers: { "retry-after": "2", "x-request-id": "req-rate" } }); },
      sleep: async (milliseconds) => { waits.push(milliseconds); }
    }),
    (error) => error.code === "RATE_LIMITED" && error.retryable && error.details.requestId === "req-rate"
  );
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [2000, 2000]);
});
