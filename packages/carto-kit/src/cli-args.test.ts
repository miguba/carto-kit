import test from "node:test";
import assert from "node:assert/strict";
import { parseCommand } from "./cli-args.js";

test("parses connect without accepting token arguments", () => {
  assert.deepEqual(parseCommand(["connect", "store", "--carto-url", "https://carto.test", "--no-open"]), {
    command: "connect", projectDir: "store", cartoUrl: "https://carto.test", openBrowser: false, yes: false
  });
  assert.throws(() => parseCommand(["connect", "--token", "secret"]), /Unknown option/);
});

test("routes removed create syntax to the rejecting command handler", () => {
  assert.deepEqual(parseCommand(["create", "store"]), { command: "legacy", args: ["create", "store"] });
});
