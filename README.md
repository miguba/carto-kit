# Carto

Command-line tools for connecting Carto Frontsite projects.

## Packages

- `packages/carto-kit`: Carto Kit CLI.

Project creation lives in the independent `create-carto-frontsite` project,
which clones the maintained starter from GitHub. This repository does not embed
or publish storefront templates.

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
