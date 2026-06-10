# **PROJECT_NAME**

Multi-product Carto storefront template for EMS with catalog browsing, product
detail pages, and React checkout.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Required `.env` values:

- `PUBLIC_COMMERCE_API_BASE_URL`: EMS API base URL when developing this template
  directly. Generated projects receive this from the scaffolded Carto config.
- `COMMERCE_API_TOKEN`: EMS server app token. Keep it server-side only.
- `DEPLOYMENT_TARGET`: `cloudflare-workers` or `vps`.

Optional values:

- `PUBLIC_MAPBOX_ACCESS_TOKEN`: enables checkout address autofill.

## Brand Logo

The template includes default Joys Box logo images at `/logo.png` for light
surfaces and `/logo-light.png` for the dark footer. Store owners can keep those
defaults or provide a custom full logo from EMS site config.

Recommended EMS site config fields:

```yaml
name: Joys Box
logoUrl: logos/joys-box-logo.svg
logoAlt: Joys Box logo
```

`logoUrl` may be an absolute URL, a site path such as `/logo.png`, or a relative
media path served from the configured EMS CDN. If `logoUrl` is empty, the
storefront falls back to `/logo.png` in the header and checkout, and uses
`/logo-light.png` in the dark footer.

The storefront renders `logoUrl` as the entire visible brand block in the header,
footer, and checkout brand bar. `site.name` is still used for page metadata and
fallback alt text, but it is not appended as separate visible text next to the
logo image.

## Home SEO

Homepage SEO is managed with a fixed EMS settings Block. Logo and brand name stay
in site config, but homepage SEO copy is template-level content that store
owners can safely edit from Blocks.

Create or edit this Block in EMS:

| Field     | Value      |
| --------- | ---------- |
| `key`     | `home-seo` |
| `type`    | `settings` |
| `content` | Markdown   |

Recommended Block content:

```md
---
blockKey: home-seo
type: settings
homeSeoTitle: Joys Box | Genuine Products, Instant Joy
homeSeoDescription: Handpicked products at unbeatable prices. Genuine quality, fast delivery, and a checkout experience that sparks joy.
---

# Home SEO Settings
```

`homeSeoTitle` controls the homepage `<title>`. `homeSeoDescription` controls
the homepage meta description. If the Block is missing, the template falls back
to `src/content/settings/home-seo.md`.

## Policy Content In EMS

This template ships with Joys Box starter policy content so the storefront has
complete legal and help pages before EMS Blocks are configured. Default Markdown
files live here:

```text
src/content/policies/
```

Store owners can override each default from EMS by creating Blocks:

| Storefront route              | Block key                    | Type     |
| ----------------------------- | ---------------------------- | -------- |
| `/contact-us`                 | `contact-us`                 | `policy` |
| `/shipping-policy`            | `shipping-policy`            | `policy` |
| `/cancellation-refund-policy` | `cancellation-refund-policy` | `policy` |
| `/terms-conditions`           | `terms-conditions`           | `policy` |
| `/privacy-policy`             | `privacy-policy`             | `policy` |

Keep the page-level settings in the Markdown frontmatter at the top of the
Block content:

```md
---
blockKey: shipping-policy
type: policy
eyebrow: Shipping
title: Shipping Policy
intro: Everything you need to know about the Joys Box shipping process...
updated: June 9, 2026
seoTitle: Shipping Policy
seoDescription: Learn about Joys Box shipping times, delivery coverage, tracking, and free shipping details.
asideTitle: Questions about your order?
asideText: If your order is delayed or you need shipping assistance, reach out with your order number and we will help.
---

## Processing Time

Policy body in Markdown...
```

The policy page reads these fields as follows:

- `title`: main page heading.
- `intro`: hero introduction below the heading.
- `updated`: visible last-updated label.
- `seoTitle` and `seoDescription`: page metadata.
- `asideTitle` and `asideText`: customer-care card copy.
- `##` headings: body section headings and the "On this page" index.

The support email shown in the customer-care cards comes from EMS site config
(`supportEmail`), not from policy Blocks. Fixed cross-links such as
`/contact-us` and `/cancellation-refund-policy` stay in the template.

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

Homepage and product detail data use page-data cache entries that do not expire
by default. Add `___refresh___=1` to a page URL to force the storefront to fetch
fresh backend read data and rewrite the cache. For persistent Cloudflare
caching, create a Workers KV namespace and set
`CLOUDFLARE_KV_NAMESPACE_ID` in `.env`; the deploy script binds it as
`KV_STORE`. Without that value, the storefront falls back to in-memory cache for
local development. Multiple storefront projects can share one KV namespace when
each project uses a unique `PAGE_CACHE_PREFIX`, which defaults to the site
domain in generated projects.

## Deploy To VPS

Set `DEPLOYMENT_TARGET=vps`, fill the `VPS_*` values in `.env`, then run:

```bash
npm run deploy
```

The VPS deploy script builds an Astro Node standalone server, uploads the
runtime bundle, runs `scripts/bootstrap-vps.sh` on the server to install or
verify Node.js, PM2, and Caddy, then starts the app with PM2 on `VPS_APP_PORT`.
On VPS, homepage and product detail data are cached on disk under `./.cache` in
`VPS_DEPLOY_DIR` by default. Set `PAGE_CACHE_DIR` if you want to store that
cache somewhere else. The deploy script creates the cache directory on the VPS
before starting PM2.
If `VPS_CADDY_DOMAIN` is set, the deploy script can write a Caddy site block
that reverse proxies that domain to `127.0.0.1:VPS_APP_PORT`.
Multiple Caddy domains are supported with comma separation, for example
`example.com, www.example.com`.

If you want to use SSH password login instead of a private key, leave
`VPS_SSH_KEY` empty. The deploy script will let `ssh`, `scp`, and remote `sudo`
prompt for passwords in your terminal.

Before publishing, review legal pages and replace generic business details with
your actual company, address, refund, shipping, and policy terms. For policy
pages backed by Blocks, make the final edits in EMS so the storefront can update
without a code deploy.
