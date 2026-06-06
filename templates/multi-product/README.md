# __PROJECT_NAME__

Multi-product Carto storefront template for EMS with catalog browsing, product
detail pages, and React checkout.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Required `.env` values:

- `COMMERCE_API_TOKEN`: EMS server app token. Keep it server-side only.
- `DEPLOYMENT_TARGET`: `cloudflare-workers` or `vps`.

Optional values:

- `PUBLIC_MAPBOX_ACCESS_TOKEN`: enables checkout address autofill.

## Deploy To Cloudflare

Set `DEPLOYMENT_TARGET=cloudflare-workers`, fill Cloudflare credentials in `.env`,
then run:

```bash
npm run deploy
```

The deploy script generates `wrangler.jsonc`, syncs `COMMERCE_API_TOKEN` as a
Cloudflare secret, and deploys the Astro server entrypoint. This template
disables Astro sessions because the storefront does not use server-side session
storage. Configure a real session driver before using `Astro.session`.

## Deploy To VPS

Set `DEPLOYMENT_TARGET=vps`, fill the `VPS_*` values in `.env`, then run:

```bash
npm run deploy
```

The VPS deploy script builds an Astro Node standalone server, uploads the
runtime bundle, runs `scripts/bootstrap-vps.sh` on the server to install or
verify Node.js, PM2, and Caddy, then starts the app with PM2 on `VPS_APP_PORT`.
If `VPS_CADDY_DOMAIN` is set, the deploy script can write a Caddy site block
that reverse proxies that domain to `127.0.0.1:VPS_APP_PORT`.
Multiple Caddy domains are supported with comma separation, for example
`example.com, www.example.com`.

If you want to use SSH password login instead of a private key, leave
`VPS_SSH_KEY` empty. The deploy script will let `ssh`, `scp`, and remote `sudo`
prompt for passwords in your terminal.

Before publishing, review legal pages and replace generic business details with
your actual company, address, refund, shipping, and policy terms.
