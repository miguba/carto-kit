import test from "node:test";
import assert from "node:assert/strict";
import { gitignoreCoversEnv, mergeEnv } from "./env-file.js";

const updates = { PUBLIC_COMMERCE_API_BASE_URL: "https://carto.test", COMMERCE_API_TOKEN: "sk_live_new" };

test("merges new env values without disturbing comments", () => {
  const result = mergeEnv("# local\nAPP_ENV=dev\n", updates);
  assert.deepEqual(result.conflicts, []);
  assert.match(result.contents, /# local\nAPP_ENV=dev/);
  assert.match(result.contents, /PUBLIC_COMMERCE_API_BASE_URL=https:\/\/carto.test/);
});

test("reports existing values and only replaces after approval", () => {
  const current = "PUBLIC_COMMERCE_API_BASE_URL=https://old.test\nCOMMERCE_API_TOKEN=sk_live_old\n";
  assert.deepEqual(mergeEnv(current, updates).conflicts.sort(), ["COMMERCE_API_TOKEN", "PUBLIC_COMMERCE_API_BASE_URL"]);
  const replaced = mergeEnv(current, updates, new Set(Object.keys(updates)));
  assert.deepEqual(replaced.conflicts, []);
  assert.doesNotMatch(replaced.contents, /old/);
});

test("recognizes common env ignore rules", () => {
  assert.equal(gitignoreCoversEnv(".env.*\n"), false);
  assert.equal(gitignoreCoversEnv("dist/\n"), false);
});
