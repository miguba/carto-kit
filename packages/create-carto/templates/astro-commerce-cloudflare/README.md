# __PROJECT_NAME__

Production-style Carto storefront template for EMS, Astro, React checkout, and
Cloudflare Workers.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Required `.env` values:

- `PUBLIC_COMMERCE_API_BASE_URL`: EMS backend base URL.
- `COMMERCE_API_TOKEN`: EMS server app token. Keep it server-side only.
- `PUBLIC_SITE_DOMAIN`: storefront domain.
- `PUBLIC_SITE_NAME`: storefront display name.

Optional values:

- `PUBLIC_CDN_BASE_URL`: CDN base URL for product media.
- `PUBLIC_MAPBOX_ACCESS_TOKEN`: enables checkout address autofill.
- `PUBLIC_FEATURED_PRODUCT_SLUG`: product slug to highlight on the landing page.

## Deploy To Cloudflare

Fill Cloudflare credentials in `.env`, then run:

```bash
npm run deploy
```

The deploy script generates `wrangler.jsonc`, syncs `COMMERCE_API_TOKEN` as a
Cloudflare secret, and deploys the Astro server entrypoint.

Before publishing, review legal pages and replace generic business details with
your actual company, address, refund, shipping, and policy terms.
