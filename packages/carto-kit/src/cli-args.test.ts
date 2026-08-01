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

test("parses deploy with an optional project directory", () => {
  assert.deepEqual(parseCommand(["deploy"]), {
    command: "deploy", projectDir: ".", reauth: false, reconfigureDomain: false
  });
  assert.deepEqual(parseCommand(["deploy", "store"]), {
    command: "deploy", projectDir: "store", reauth: false, reconfigureDomain: false
  });
  assert.deepEqual(parseCommand(["deploy", "--reauth"]), {
    command: "deploy", projectDir: ".", reauth: true, reconfigureDomain: false
  });
  assert.deepEqual(parseCommand(["deploy", "--reconfigure-domain"]), {
    command: "deploy", projectDir: ".", reauth: false, reconfigureDomain: true
  });
  assert.deepEqual(parseCommand(["deploy", "--help"]), {
    command: "deploy", projectDir: "__HELP__", reauth: false, reconfigureDomain: false
  });
  assert.throws(() => parseCommand(["deploy", "one", "two"]), /at most one/);
});
