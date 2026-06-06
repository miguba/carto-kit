# Carto

Official self-hosted storefront starter for EMS commerce sites.

## Packages

- `packages/carto-kit`: Carto Kit CLI and project generator.
- `packages/create-carto-wrapper`: `npm create carto` compatibility entrypoint.
- `templates/single-product`: one-domain, one-product storefront template.
- `templates/multi-product`: catalog storefront template with Cloudflare and VPS deployment modes.

## Development

```bash
npm install
npm run build
npm --prefix templates/single-product run dev
npm --prefix templates/multi-product run dev
```

## Create A Storefront

```bash
npm create carto@latest
```

This works like `npm create astro@latest`: npm resolves the published
`create-carto` package and runs the Carto Kit project generator.

Users who install the full tool can also run:

```bash
npm i -g carto-kit
carto-kit create my-storefront
```

The generated project owns its domain, hosting, payment accounts, deployment
credentials, and compliance responsibilities. EMS supplies content, orders,
payment configuration, and API contracts.

## Configure EMS API Base URL

Carto stores a user-level default API base URL, similar to npm config:

```bash
carto config keys
carto config list
carto config set commerceApiBaseUrl https://ems.example.com
carto config get commerceApiBaseUrl
```

New storefronts use that configured value. For one generated project only, pass
an override:

```bash
npm create carto@latest -- my-storefront --api-base-url https://ems.example.com
```
