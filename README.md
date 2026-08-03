# Carto

Command-line tools for connecting Carto Frontsite projects.

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

## Publishing

See [docs/npm-release.md](docs/npm-release.md) for the tag-triggered npm release
checklist.
