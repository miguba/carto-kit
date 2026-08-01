import { parseArgs } from "node:util";

export type ParsedCommand =
  | { command: "connect"; projectDir: string; cartoUrl?: string; openBrowser: boolean; yes: boolean }
  | { command: "deploy"; projectDir: string; reauth: boolean; reconfigureDomain: boolean }
  | { command: "legacy"; args: string[] };

export function parseCommand(args: string[]): ParsedCommand {
  if (args[0] === "deploy") {
    const parsed = parseArgs({
      args: args.slice(1), allowPositionals: true, strict: true,
      options: {
        reauth: { type: "boolean" },
        "reconfigure-domain": { type: "boolean" },
        help: { type: "boolean", short: "h" }
      }
    });
    if (parsed.values.help) {
      return { command: "deploy", projectDir: "__HELP__", reauth: false, reconfigureDomain: false };
    }
    if (parsed.positionals.length > 1) throw new Error("deploy accepts at most one project directory.");
    return {
      command: "deploy",
      projectDir: parsed.positionals[0] ?? ".",
      reauth: parsed.values.reauth === true,
      reconfigureDomain: parsed.values["reconfigure-domain"] === true
    };
  }
  if (args[0] !== "connect") return { command: "legacy", args };
  const parsed = parseArgs({
    args: args.slice(1),
    allowPositionals: true,
    strict: true,
    options: {
      "carto-url": { type: "string" },
      "no-open": { type: "boolean" },
      yes: { type: "boolean", short: "y" },
      help: { type: "boolean", short: "h" }
    }
  });
  if (parsed.values.help) {
    return { command: "connect", projectDir: "__HELP__", openBrowser: true, yes: false };
  }
  if (parsed.positionals.length > 1) throw new Error("connect accepts at most one project directory.");
  return {
    command: "connect",
    projectDir: parsed.positionals[0] ?? ".",
    cartoUrl: parsed.values["carto-url"],
    openBrowser: parsed.values["no-open"] !== true,
    yes: parsed.values.yes === true
  };
}
