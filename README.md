# Carto

Official self-hosted storefront starter for EMS single-product commerce sites.

## Packages

- `packages/create-carto`: project initializer CLI.
- `templates/astro-storefront`: official Astro storefront template.

## Development

```bash
npm install
npm run build
npm --prefix templates/astro-storefront run dev
```

## Create A Storefront

```bash
npm create carto@latest
```

This works like `npm create astro@latest`: npm resolves the published
`create-carto` package and runs its interactive project generator.

The generated project owns its domain, hosting, payment accounts, deployment
credentials, and compliance responsibilities. EMS supplies content, orders,
payment configuration, and API contracts.
