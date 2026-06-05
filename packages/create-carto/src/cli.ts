#!/usr/bin/env node
import { parseArgs } from "node:util";
import { basename, relative } from "node:path";
import kleur from "kleur";
import { collectAnswers, type CliOptions } from "./prompts.js";
import { scaffoldStorefront } from "./scaffold.js";
import { deploymentTargets, frontendModes, templates, validateDomain, validateProjectName, validateUrl } from "./validators.js";

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      api: { type: "string" },
      site: { type: "string" },
      template: { type: "string" },
      mode: { type: "string" },
      deploy: { type: "string" },
      yes: { type: "boolean", short: "y" },
      help: { type: "boolean", short: "h" }
    }
  });

  if (values.help) {
    printHelp();
    return;
  }

  const projectName = positionals[0];
  if (projectName) assertValidation(validateProjectName(projectName));

  const options = parseOptions(values);
  if (options.api) assertValidation(validateUrl(options.api));
  if (options.site) assertValidation(validateDomain(options.site));

  if (!options.yes) {
    console.log("");
    console.log(kleur.bold("carto"));
    console.log("Create a self-hosted EMS storefront.");
    console.log("");
  }

  const answers = await collectAnswers(projectName, options);
  const result = await scaffoldStorefront(answers);

  const projectPath = relative(process.cwd(), result.projectDir) || basename(result.projectDir);
  const pm = result.packageManager;
  const run = pm === "npm" ? "npm run" : pm;

  console.log("");
  console.log(kleur.green("Carto storefront created."));
  console.log("");
  console.log(kleur.bold("Next steps:"));
  console.log(`  cd ${projectPath}`);
  console.log(`  ${pm} install`);
  console.log(`  ${run} dev`);
  if (answers.deploymentTarget === "vps") {
    console.log(`  ${run} deploy:vps`);
  }
  if (answers.deploymentTarget === "cloudflare-pages" && answers.template === "astro-commerce-cloudflare") {
    console.log(`  ${run} deploy`);
  } else if (answers.deploymentTarget === "cloudflare-pages") {
    console.log("");
    console.log("Cloudflare deploy support is a placeholder for this template.");
  }
  console.log("");
  console.log("Secrets were written to .env and were not printed.");
}

function parseOptions(values: Record<string, string | boolean | undefined>): CliOptions {
  const options: CliOptions = {
    api: typeof values.api === "string" ? values.api : undefined,
    site: typeof values.site === "string" ? values.site : undefined,
    yes: values.yes === true
  };

  if (typeof values.template === "string") {
    if (!templates.includes(values.template as never)) {
      throw new Error(`Unknown template "${values.template}".`);
    }
    options.template = values.template as CliOptions["template"];
  }

  if (typeof values.mode === "string") {
    if (!frontendModes.includes(values.mode as never)) {
      throw new Error(`Unknown frontend mode "${values.mode}".`);
    }
    options.mode = values.mode as CliOptions["mode"];
  }

  if (typeof values.deploy === "string") {
    if (!deploymentTargets.includes(values.deploy as never)) {
      throw new Error(`Unknown deployment target "${values.deploy}".`);
    }
    options.deploy = values.deploy as CliOptions["deploy"];
  }

  return options;
}

function assertValidation(result: true | string): void {
  if (result !== true) throw new Error(result);
}

function printHelp(): void {
  console.log(`create-carto

Usage:
  npm create carto@latest
  yarn create carto
  npx create-carto my-storefront --api https://ems.example.com --site example.com

Options:
  --api <url>          EMS API base URL
  --site <domain>      EMS site domain
  --template <name>    Template: astro-storefront, astro-commerce-cloudflare
  --mode <mode>        Frontend mode: ssr, static
  --deploy <target>    Deployment target: none, vps, cloudflare-pages
  -y, --yes            Accept defaults for optional prompts
  -h, --help           Show help
`);
}

main().catch((error: unknown) => {
  console.error(kleur.red("Failed to create storefront."));
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
