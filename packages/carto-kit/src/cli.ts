#!/usr/bin/env node
import { parseArgs } from "node:util";
import kleur from "kleur";
import { parseCommand } from "./cli-args.js";
import { connectPrivate } from "./connect.js";
import { printConnectHelp, runConnect } from "./connect-legacy.js";
import { pullContractBundle } from "./contract.js";
import { printDeployHelp, runDeploy } from "./deploy.js";
import { asCartoError, CartoError } from "./errors.js";
import { doctorFrontsite, verifyFrontsite, type FrontsiteReport } from "./frontsite.js";
import { createOutput } from "./output.js";
import { redactSensitive } from "./security.js";

const CLI_VERSION = "0.1.34";

async function aiMain(): Promise<void> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      strict: true,
      options: {
        reauth: { type: "boolean" },
        json: { type: "boolean" },
        "no-browser": { type: "boolean" },
        timeout: { type: "string" },
        offline: { type: "boolean" },
        version: { type: "boolean", short: "v" },
        help: { type: "boolean", short: "h" }
      }
    });
  } catch (error) {
    throw new CartoError("USAGE_ERROR", error instanceof Error ? error.message : "Invalid arguments.");
  }

  const { positionals, values } = parsed;
  const output = createOutput(values.json === true);
  const command = positionals.join(" ") || "help";
  try {
    if (values.version === true && positionals.length === 0) {
      if (output.json) output.success("version", { version: CLI_VERSION });
      else process.stdout.write(`${CLI_VERSION}\n`);
      return;
    }

    if (values.help || command === "help") {
      if (output.json) output.success("help", { text: helpText() });
      else process.stdout.write(helpText());
      return;
    }

    if (positionals.length === 1 && positionals[0] === "deploy") {
      rejectOptions(values, ["reauth", "json"]);
      await runDeploy(process.cwd(), { reauth: values.reauth === true });
      output.success("deploy", { status: "deployed" });
      return;
    }

    if (positionals.length === 1 && positionals[0] === "connect") {
      rejectOptions(values, ["reauth", "json", "no-browser", "timeout"]);
      const timeoutSeconds = parseTimeout(typeof values.timeout === "string" ? values.timeout : undefined);
      const controller = new AbortController();
      process.once("SIGINT", () => controller.abort());
      const data = await connectPrivate(process.cwd(), {
        reauth: values.reauth === true,
        noBrowser: values["no-browser"] === true,
        timeoutSeconds,
        signal: controller.signal,
        output
      });
      output.success("connect", data);
      if (!output.json) output.diagnostic(data.changed ? "Connected to Carto Private." : "Already connected to Carto Private.");
      return;
    }

    if (positionals.length === 2 && positionals[0] === "contract" && positionals[1] === "pull") {
      rejectOptions(values, ["json", "offline"]);
      const data = await pullContractBundle(process.cwd(), {
        offline: values.offline === true,
        endpoint: contractBundleEndpoint()
      });
      output.success("contract pull", { ...data });
      if (!output.json) output.diagnostic(`Contract Bundle ready at ${data.path}.`);
      return;
    }

    if (positionals.length === 2 && positionals[0] === "frontsite" && (positionals[1] === "doctor" || positionals[1] === "verify")) {
      rejectOptions(values, ["json"]);
      const report = positionals[1] === "doctor"
        ? await doctorFrontsite(process.cwd())
        : await verifyFrontsite(process.cwd());
      if (output.json) output.result(`frontsite ${positionals[1]}`, report.ok, { report });
      else printReport(report);
      if (!report.ok) process.exitCode = 1;
      return;
    }

    throw new CartoError("USAGE_ERROR", `Unknown command "${command}". Run carto --help for usage.`);
  } catch (error) {
    const safe = asCartoError(error);
    output.failure(command, safe);
    process.exitCode = safe.exitCode;
  }
}

function contractBundleEndpoint(): string | undefined {
  if (process.env.CARTO_CONTRACT_BUNDLE_URL?.trim()) return process.env.CARTO_CONTRACT_BUNDLE_URL.trim();
  if (!process.env.CARTO_PRIVATE_API_URL?.trim()) return undefined;
  return new URL("/api/v1/frontsite/contract-bundle", process.env.CARTO_PRIVATE_API_URL).href;
}

function rejectOptions(values: Record<string, string | boolean | (string | boolean)[] | undefined>, allowed: string[]): void {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && key !== "help" && !allowed.includes(key)) {
      throw new CartoError("USAGE_ERROR", `--${key} is not valid for this command.`);
    }
  }
}

function parseTimeout(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
    throw new CartoError("USAGE_ERROR", "--timeout must be an integer from 1 to 3600 seconds.");
  }
  return seconds;
}

function printReport(report: FrontsiteReport): void {
  console.log(`carto frontsite ${report.command}: ${report.ok ? "passed" : "needs attention"}`);
  for (const result of report.gates) {
    console.log(`${result.status.toUpperCase()} ${result.gate}`);
    for (const item of result.findings) console.log(`  ${item.severity.toUpperCase()} ${item.code}: ${item.message}`);
  }
}

function helpText(): string {
  return `carto-kit\n\nConnect, inspect, verify, and deploy a Carto storefront.\n\nUsage:\n  carto connect [--reauth] [--no-browser] [--timeout <seconds>] [--json]\n  carto contract pull [--offline] [--json]\n  carto frontsite doctor [--json]\n  carto frontsite verify [--json]\n  carto deploy [--reauth] [--json]\n\nOptions:\n  --reauth              Force fresh authentication\n  --no-browser          Do not open the verification URL automatically\n  --timeout <seconds>   Stop authorization after 1-3600 seconds\n  --offline             Validate and use the cached Contract Bundle\n  --json                Emit one versioned JSON envelope on stdout\n  -h, --help            Show help\n\nCredentials are never accepted as arguments or printed.\n`;
}

async function legacyMain(): Promise<void> {
  const command = parseCommand(process.argv.slice(2));
  if (command.command === "legacy") {
    if (command.args.length === 0 || command.args[0] === "--help" || command.args[0] === "-h") {
      process.stdout.write(helpText());
      return;
    }
    throw new Error(`Unknown command "${command.args[0]}". Run carto --help.`);
  }
  if (command.command === "deploy") {
    if (command.projectDir === "__HELP__") return printDeployHelp();
    return runDeploy(command.projectDir, { reauth: command.reauth, reconfigureDomain: command.reconfigureDomain });
  }
  if (command.projectDir === "__HELP__") return printConnectHelp();
  await runConnect(command);
}

const args = process.argv.slice(2);
const useAiMode = args.includes("--json") || args.includes("--version") || args.includes("-v") || args[0] === "contract" || args[0] === "frontsite";
(useAiMode ? aiMain() : legacyMain()).catch((error: unknown) => {
  if (!useAiMode) {
    console.error(kleur.red("Carto command failed."));
    console.error(redactSensitive(error));
    process.exitCode = 1;
    return;
  }
  const safe = asCartoError(error);
  createOutput(process.argv.includes("--json")).failure("unknown", safe);
  process.exitCode = safe.exitCode;
});
