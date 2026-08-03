import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectFrontsiteProject } from "./project.js";

test("recognizes a Frontsite without coupling core commands to a framework", async () => {
  const root = await mkdtemp(join(tmpdir(), "carto-project-test-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "shop", scripts: { build: "custom-build" } }));
  await writeFile(join(root, "carto.config.json"), JSON.stringify({ schemaVersion: 1, framework: "custom" }));
  const project = await inspectFrontsiteProject(root);
  assert.equal(project.packageName, "shop");
  assert.deepEqual(project.packageJson, { name: "shop", scripts: { build: "custom-build" } });
});

test("does not mistake an arbitrary Node project for a Frontsite", async () => {
  const root = await mkdtemp(join(tmpdir(), "carto-project-test-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "ordinary-app" }));
  await assert.rejects(inspectFrontsiteProject(root), /expected carto.config.json or legacy Carto commerce markers/);
});

test("rejects directories without valid package metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "carto-project-test-"));
  await assert.rejects(inspectFrontsiteProject(root), /could not read/);
});
