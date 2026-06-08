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

## Publishing

To publish new versions of `carto-kit` and `create-carto` to npm, follow these steps:

1. **Verify & Test**: Ensure everything compiles and passes local checks:
   ```bash
   npm run test
   ```

2. **Build**: Build the CLI package and copy the storefront templates:
   ```bash
   npm run build
   ```

3. **Update Versions**: 
   - Update the `version` field in [packages/carto-kit/package.json](file:///Users/worker/wsxg/carto-kit/packages/carto-kit/package.json).
   - Update the `version` field and the `carto-kit` dependency version in [packages/create-carto-wrapper/package.json](file:///Users/worker/wsxg/carto-kit/packages/create-carto-wrapper/package.json).

4. **Publish to npm**:
   First, publish the core CLI tool `carto-kit`:
   ```bash
   npm publish -w packages/carto-kit --access public
   ```
   Then, publish the `create-carto` wrapper:
   ```bash
   npm publish -w packages/create-carto-wrapper --access public
   ```

