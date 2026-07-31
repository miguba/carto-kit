import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { input, confirm } from "@inquirer/prompts";
import kleur from "kleur";
import type { ParsedCommand } from "./cli-args.js";
import { beginDeviceAuthorization, pollDeviceAuthorization, verifyCommerceApi } from "./auth.js";
import { addEnvToGitignore, gitignoreCoversEnv, mergeEnv, readOptional, writeEnv } from "./env-file.js";
import { inspectFrontsiteProject } from "./project.js";
import { normalizeHttpBaseUrl, validateHttpBaseUrl } from "./validators.js";

type ConnectCommand = Extract<ParsedCommand, { command: "connect" }>;

export async function runConnect(options: ConnectCommand): Promise<void> {
  const project = await inspectFrontsiteProject(options.projectDir);
  const cartoUrl = normalizeHttpBaseUrl(options.cartoUrl ?? await input({
    message: "Carto Private URL",
    validate: validateHttpBaseUrl
  }));
  const validation = validateHttpBaseUrl(cartoUrl);
  if (validation !== true) throw new Error(validation);

  console.log(`Connecting ${kleur.bold(project.packageName)} to ${cartoUrl}`);
  const authorization = await beginDeviceAuthorization(cartoUrl, project.packageName);
  console.log(`Open ${authorization.verificationUri}`);
  console.log(`Enter code: ${kleur.bold(authorization.userCode)}`);
  if (options.openBrowser) openBrowser(authorization.verificationUri);
  const credential = await pollDeviceAuthorization(cartoUrl, authorization);

  const currentEnv = await readOptional(project.envPath);
  let merged = mergeEnv(currentEnv, {
    PUBLIC_COMMERCE_API_BASE_URL: credential.apiBaseUrl.replace(/\/+$/, ""),
    COMMERCE_API_TOKEN: credential.token
  });
  if (merged.conflicts.length > 0) {
    if (options.yes) throw new Error(`Existing .env values were not changed: ${merged.conflicts.join(", ")}. Run interactively to confirm replacement.`);
    const approved = await confirm({ message: `Replace existing ${merged.conflicts.join(" and ")} in .env?`, default: false });
    if (!approved) throw new Error("Existing .env values were left unchanged.");
    merged = mergeEnv(currentEnv, {
      PUBLIC_COMMERCE_API_BASE_URL: credential.apiBaseUrl.replace(/\/+$/, ""), COMMERCE_API_TOKEN: credential.token
    }, new Set(merged.conflicts));
  }

  const ignore = await readOptional(project.gitignorePath);
  if (!gitignoreCoversEnv(ignore)) await writeFile(project.gitignorePath, addEnvToGitignore(ignore));
  await writeEnv(project.envPath, merged.contents);
  await verifyCommerceApi(credential.apiBaseUrl, credential.token);
  console.log(kleur.green("Carto connection completed."));
  console.log(`Site: ${credential.site}`);
  console.log(`Server App: ${credential.serverApp.name} (${credential.serverApp.scopes.join(", ")})`);
  console.log("Credentials were written to .env with restricted permissions and were not printed.");
}

export function printConnectHelp(): void {
  console.log(`carto connect [project-directory]

Securely connect a Carto Frontsite project to Carto Private.

Options:
  --carto-url <url>  Carto Private origin (not a Commerce API token)
  --no-open          Do not open the verification page automatically
  -y, --yes          Non-interactive mode; refuses to replace existing values
  -h, --help         Show this help

Tokens are never accepted as command-line arguments.`);
}

function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => undefined);
  child.unref();
}
