# Carto Single Product Template

This template renders a checkout-focused storefront from Carto commerce APIs.
The purchase section is controlled by a Carto Block, while product content,
images, highlights, variants, prices, and stock stay on standard Carto products.

## Setup

```bash
npm install
npm run dev
```

For direct template development, set these environment values:

- `PUBLIC_COMMERCE_API_BASE_URL`: Carto API base URL.
- `COMMERCE_API_TOKEN`: Carto server app token with commerce scopes.
- `PUBLIC_MAPBOX_ACCESS_TOKEN`: optional Mapbox token for address search.

Generated projects receive the commerce API base URL from Carto scaffolding.
Payment provider secrets stay in Carto and are never exposed to browser
JavaScript.

## Required Carto Block

Create a Carto Block with key `purchase-products`. The template reads this
Block as the purchase page configuration.

### Full Switchable Template

Keep both single-product and product-group settings in the same Block. Change
only `mode` to switch the current page display.

```md
---
mode: single
single:
  product:
    slug: microsoft-365-5-devices-license
group:
  default: five
  products:
    - key: one
      label: 1 Device
      slug: microsoft-office-365-1-devices-license
    - key: three
      label: 3 Devices
      slug: microsoft-office-365-3-devices-license
    - key: five
      label: 5 Devices
      slug: microsoft-office-365-5-devices-license
---
```

Use `mode: single` to render `single.product` without tabs. Use `mode: group`
to render `group.products` as tabs.

### Single Product Only

```md
---
mode: single
single:
  product:
    slug: microsoft-365-5-devices-license
---
```

### Product Group Only

```md
---
mode: group
group:
  default: five
  products:
    - key: one
      label: 1 Device
      slug: microsoft-office-365-1-devices-license
    - key: three
      label: 3 Devices
      slug: microsoft-office-365-3-devices-license
    - key: five
      label: 5 Devices
      slug: microsoft-office-365-5-devices-license
---
```

## Block Rules

- `mode` is required and must be `single` or `group`.
- `single.product.slug` is required.
- `group.products` must contain at least 2 items.
- Every group product must include `key`, `label`, and `slug`.
- `group.default` is optional. When provided, it must match a product `key`.
- Product `key` values must be unique.
- Product `slug` values must be unique.
- All slugs must resolve to active Carto products through the commerce product API.
- Only the active `mode` is validated and loaded. You can keep the inactive
  mode's configuration in the YAML while switching display modes.

If the Block is missing or invalid, the page shows a clear configuration
error in development instead of falling back to an implicit product.

The preferred format is YAML frontmatter in the `purchase-products` Block.
Plain JSON/YAML content is also accepted, including the legacy wrapper key
`purchase-products`.

## Optional Carto Blocks

Block-based home page and footer content is documented in
[`decoration.md`](./decoration.md).

## Product Data Responsibilities

The `purchase-products` Block is only page composition data. Product content
stays on Carto products:

- Main purchase image: `product.mainImage`
- Additional media: `product.galleryImages`, product video, and variant images
- Highlights in the purchase section: `product.sellingPoints` or
  `product.meta.sellingPoints`
- Purchase options: standard `product.variants`
- Price, compare-at price, and stock: standard variant fields

In group mode, switching tabs swaps the active Carto product. The checkout URL
continues to use the selected product and variant:

```text
/checkout?slug=<product.slug>&sku=<variant.sku>&quantity=1
```

The selected group tab is reflected in the URL as `?product=<key>` so the page
can be refreshed or shared with the same tab selected.

## VPS Deploy

Fill the `VPS_*` values in `.env`, then run:

```bash
npm run deploy:vps
```

The deploy script builds the Astro app, uploads the build output to the server,
bootstraps Node.js, PM2, and Caddy, installs production dependencies, and
serves the app behind Caddy when `VPS_CADDY_DOMAIN` is configured.

## Backend Data Cache

Homepage data, product reads, commerce config, policy/footer Blocks, and local
read proxies under `/api/commerce/*` use the shared page-data cache. Add
`___refresh___=1` to a URL to bypass and refresh the cache for that request.

On Cloudflare Workers, create a Workers KV namespace and set
`CLOUDFLARE_KV_NAMESPACE_ID` before deploy; the generated `wrangler.jsonc` binds
it as `KV_STORE`. Without a KV namespace, local development falls back to
in-memory cache. Multiple storefront projects can share one KV namespace when
each project uses a unique `PAGE_CACHE_PREFIX`, which defaults to the site
domain in generated projects.

On VPS, set `DEPLOYMENT_TARGET=vps`. Cached data is stored on disk under
`./.cache` by default, or under `PAGE_CACHE_DIR` when that variable is set.
The deploy script creates the cache directory on the VPS before starting PM2.
