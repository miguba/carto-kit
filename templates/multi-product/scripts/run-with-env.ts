// @ts-nocheck
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const separatorIndex = process.argv.indexOf('--');

if (separatorIndex < 0 || separatorIndex === process.argv.length - 1) {
  throw new Error('Usage: run-with-env.ts <env-file...> -- <command> [args...]');
}

const envFiles = process.argv.slice(2, separatorIndex);
const [command, ...args] = process.argv.slice(separatorIndex + 1);
const env = { ...process.env };
const localBin = path.resolve('node_modules/.bin');

env.PATH = [localBin, env.PATH].filter(Boolean).join(path.delimiter);

for (const file of envFiles) {
  loadEnvFile(path.resolve(file), env);
}

const child = spawn(command, args, {
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

function loadEnvFile(filePath: string, env: NodeJS.ProcessEnv) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const source = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    env[key] = parseEnvValue(rawValue);
  }
}

function parseEnvValue(value: string) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1);
  }

  const commentStart = trimmed.indexOf(' #');
  return commentStart >= 0 ? trimmed.slice(0, commentStart).trim() : trimmed;
}
