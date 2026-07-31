#!/usr/bin/env node
import kleur from "kleur";
import { parseCommand } from "./cli-args.js";
import { runConnect, printConnectHelp } from "./connect.js";
import { redactSensitive } from "./security.js";

function runLegacy(args: string[]): void {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    return;
  }
  throw new Error(`Unknown command "${args[0]}". Run carto --help.`);
}

function printHelp(): void {
  console.log(`carto

Usage:
  carto connect
`);
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv.slice(2));
  if (command.command === "legacy") return runLegacy(command.args);
  if (command.projectDir === "__HELP__") return printConnectHelp();
  await runConnect(command);
}

main().catch((error: unknown) => {
  console.error(kleur.red("Carto command failed."));
  console.error(redactSensitive(error));
  process.exitCode = 1;
});
