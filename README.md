# Carto

Framework-independent command-line tools for connecting, validating, and deploying Carto Frontsite projects.

## Packages

- `packages/carto-kit`: Carto Kit CLI.

Project creation lives in the independent `create-carto-frontsite` project,
which clones the maintained starter from GitHub. This repository does not embed
or publish storefront templates.

## AI-ready storefront commands

Carto Kit exposes deterministic commands for AI orchestrators and humans:

```bash
carto connect --json
carto contract pull --json
carto frontsite doctor --json
carto frontsite verify --json
```

Every JSON command emits one versioned envelope on stdout; diagnostics go to stderr. Credentials are never accepted as command arguments or returned in JSON.

`carto connect` opens the Carto Private browser authorization flow and stores the credential in the ignored, permission-restricted `.carto/secrets.json`. Until a production base URL is published, set `CARTO_PRIVATE_API_URL` to the documented Carto Private origin.

`carto contract pull` uses that stored credential, validates a public v1 Contract Bundle, and atomically writes `.carto/contracts/bundle.json`. It derives `/api/v1/frontsite/contract-bundle` from `CARTO_PRIVATE_API_URL`; `CARTO_CONTRACT_BUNDLE_URL` can override the endpoint. It uses private ETag revalidation, honors `Retry-After`, preserves safe request IDs, and distinguishes expired/revoked credentials from missing scope. `--offline` validates and uses the cached bundle.

`doctor` performs non-destructive project, connection, and contract capability checks. `verify` runs contract, safety, functional, engineering, and visual gates. Missing real functional or desktop/mobile visual scripts are reported as `blocked`, never as successful.

## Development

```bash
npm install
npm test
npm run build
```

## Connect A Frontsite

From an existing Carto Frontsite project, use the long-lived Carto Kit command
to connect it to Carto Private:

```bash
npx carto-kit@latest connect
# or, after a global install:
carto connect
```

The command uses browser/device authorization, writes the Commerce API URL and
Server App token only to the ignored local `.env`, and verifies the Commerce
API connection. Carto Private must implement the device authorization contract
in [docs/carto-private-connect-contract.md](docs/carto-private-connect-contract.md).

## Deploy A Frontsite

From an existing Carto Frontsite project:

```bash
npx carto-kit@latest deploy
```

Core commands (`connect`, `contract pull`, `frontsite doctor`, and `frontsite
verify`) do not require Astro or any other frontend framework. Deployment uses a
framework adapter selected by `carto.config.json`:

```json
{
  "schemaVersion": 1,
  "framework": "astro",
  "deployment": {
    "provider": "cloudflare-workers"
  }
}
```

The built-in `astro` adapter supports Astro 6 and 7 with Cloudflare Workers.
Existing Astro Frontsites without an explicit `framework` field continue to be
detected automatically. New projects should declare the framework explicitly.

Framework-specific detection, dependency preparation, and build configuration
live behind the adapter registry; Carto authentication, contracts, diagnostics,
and verification remain framework-independent.

## Publishing

See [docs/npm-release.md](docs/npm-release.md) for the tag-triggered npm release
checklist.
