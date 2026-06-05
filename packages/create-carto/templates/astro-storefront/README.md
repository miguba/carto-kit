# __PROJECT_NAME__

Self-hosted Carto storefront generated from `create-carto`.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Required `.env` values:

- `EMS_API_BASE_URL`: EMS backend base URL.
- `EMS_SITE_DOMAIN`: EMS site domain.
- `PUBLIC_SITE_URL`: public storefront URL.
- `FRONTEND_MODE`: `ssr` or `static`.
- `EMS_SERVER_APP_TOKEN`: optional SSR-only server token.

The storefront fetches public payment configuration from EMS. PayPal client
secrets, Stripe secret keys, and Stripe webhook secrets must stay in EMS.

## Pages

- `/`: product list.
- `/products/[slug]`: product detail.
- `/checkout/[slug]`: checkout for a product.

## VPS Deploy

Fill the `VPS_*` values in `.env`, then run:

```bash
npm run deploy:vps
```

The deploy script runs locally, builds the Astro app, uploads the build output
to your server, installs production dependencies, and starts or restarts PM2.
It does not send VPS credentials to EMS.
