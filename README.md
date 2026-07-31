# Carto

Command-line tools for connecting Carto Frontsite projects.

## Packages

- `packages/carto-kit`: Carto Kit CLI.
- `templates/single-product`: one-domain, one-product storefront template.
- `templates/multi-product`: catalog storefront template with Cloudflare and VPS deployment modes.

## Development

```bash
npm install
npm run build
npm --prefix templates/single-product run dev
npm --prefix templates/multi-product run dev
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

## Publishing

See [docs/npm-release.md](docs/npm-release.md) for the npm release checklist,
including version bumps, dry runs, OTP handling, and
post-publish verification.
