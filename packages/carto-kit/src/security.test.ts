import test from "node:test";
import assert from "node:assert/strict";
import { redactSensitive } from "./security.js";

test("redacts tokens in errors and authorization headers", () => {
  const result = redactSensitive('token=abc123 Authorization: Bearer sk_live_supersecret');
  assert.doesNotMatch(result, /abc123|supersecret/);
  assert.match(result, /REDACTED/);
});
