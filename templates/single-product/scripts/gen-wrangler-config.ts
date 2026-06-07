// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

const nodeEnv = process.env.NODE_ENV || 'development';
const envFiles = ['.env', `.env.${nodeEnv}`].filter(
  (file, index, files) => files.indexOf(file) === index,
);

for (const file of envFiles) {
  loadEnvFile(path.resolve(file));
}

const appName = normalizeWorkerName(requiredEnv('APP_NAME'));
const publicVars = pickEnvVars(['APP_NAME', 'PUBLIC_MAPBOX_ACCESS_TOKEN']);
const serverVars = pickEnvVars(['COMMERCE_API_TOKEN']);

const cfg = {
  $schema: './node_modules/wrangler/config-schema.json',
  name: appName,
  main: '@astrojs/cloudflare/entrypoints/server',
  compatibility_date: '2026-05-17',
  compatibility_flags: ['nodejs_compat'],
  assets: {
    binding: 'ASSETS',
    directory: './dist',
  },
  observability: {
    enabled: true,
  },
  ...(Object.keys({ ...publicVars, ...serverVars }).length > 0
    ? { vars: { ...publicVars, ...serverVars } }
    : {}),
};

fs.writeFileSync('wrangler.jsonc', `${JSON.stringify(cfg, null, 2)}\n`);
console.log(`[gen] wrote wrangler.jsonc for ${nodeEnv}`);

if (fs.existsSync('wrangler-prod.jsonc')) {
  fs.unlinkSync('wrangler-prod.jsonc');
  console.log(`[gen] removed legacy wrangler-prod.jsonc`);
}

function loadEnvFile(filePath: string) {
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
    process.env[key] = parseEnvValue(rawValue);
  }

  console.log(`[env] loaded ${path.basename(filePath)}`);
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

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function pickEnvVars(keys: string[]): Record<string, string> {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = process.env[key];
      return value ? [[key, value]] : [];
    }),
  );
}

function normalizeWorkerName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (!normalized) {
    throw new Error('APP_NAME must contain at least one letter or number');
  }

  return normalized;
}
