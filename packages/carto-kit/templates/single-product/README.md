# __PROJECT_NAME__

Self-hosted Carto storefront generated from Carto Kit.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Required `.env` values:

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
npm run deploy
```

The deploy script runs locally, builds the Astro app, uploads the build output
to your server, runs `scripts/bootstrap-vps.sh` on the server to install or
verify Node.js, PM2, and Caddy, installs production dependencies, and starts or
restarts PM2 on `VPS_APP_PORT`. If `VPS_CADDY_DOMAIN` is set, it can write a
Caddy site block that reverse proxies that domain to
`127.0.0.1:VPS_APP_PORT`. It does not send VPS credentials to EMS.
Multiple Caddy domains are supported with comma separation, for example
`example.com, www.example.com`.

If you want to use SSH password login instead of a private key, leave
`VPS_SSH_KEY` empty. The deploy script will let `ssh`, `scp`, and remote `sudo`
prompt for passwords in your terminal.
