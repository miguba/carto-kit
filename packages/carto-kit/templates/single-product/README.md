# Carto Single Product Template

This template renders a checkout-focused storefront from EMS commerce APIs.
The purchase section is controlled by EMS site decoration data, while product
content, images, highlights, variants, prices, and stock stay on standard EMS
products.

## Setup

```bash
npm install
npm run dev
```

For direct template development, set these environment values:

- `PUBLIC_COMMERCE_API_BASE_URL`: EMS API base URL.
- `COMMERCE_API_TOKEN`: EMS server app token with commerce scopes.
- `PUBLIC_MAPBOX_ACCESS_TOKEN`: optional Mapbox token for address search.

Generated projects receive the commerce API base URL from Carto scaffolding.
Payment provider secrets stay in EMS and are never exposed to browser
JavaScript.

## Required EMS Decoration

Open the EMS site decoration editor and add a `purchase-products` section.
The template reads the first item in this section as the purchase page
configuration.

### Full Switchable Template

Keep both single-product and product-group settings in the same decoration
block. Change only `mode` to switch the current page display.

```yaml
purchase-products:
  - mode: single
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
```

Use `mode: single` to render `single.product` without tabs. Use `mode: group`
to render `group.products` as tabs.

### Single Product Only

```yaml
purchase-products:
  - mode: single
    single:
      product:
        slug: microsoft-365-5-devices-license
```

### Product Group Only

```yaml
purchase-products:
  - mode: group
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
```

## Decoration Rules

- `mode` is required and must be `single` or `group`.
- `single.product.slug` is required.
- `group.products` must contain at least 2 items.
- Every group product must include `key`, `label`, and `slug`.
- `group.default` is optional. When provided, it must match a product `key`.
- Product `key` values must be unique.
- Product `slug` values must be unique.
- All slugs must resolve to active EMS products through the commerce product API.
- Only the active `mode` is validated and loaded. You can keep the inactive
  mode's configuration in the YAML while switching display modes.

If the decoration is missing or invalid, the page shows a clear configuration
error in development instead of falling back to an implicit product.

## Optional EMS Blocks

Block-based home page and footer content is documented in
[`decoration.md`](./decoration.md).

## Product Data Responsibilities

Decoration is only page composition data. Product content stays on EMS
products:

- Main purchase image: `product.mainImage`
- Additional media: `product.galleryImages`, product video, and variant images
- Highlights in the purchase section: `product.sellingPoints` or
  `product.meta.sellingPoints`
- Purchase options: standard `product.variants`
- Price, compare-at price, and stock: standard variant fields

In group mode, switching tabs swaps the active EMS product. The checkout URL
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
