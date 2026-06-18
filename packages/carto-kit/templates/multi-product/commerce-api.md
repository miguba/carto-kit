# Carto Storefront API Contract

This project uses Carto's OpenAPI contract as the source of truth for storefront
server-to-Carto API calls.

- OpenAPI document: `docs/storefront-v1.openapi.yaml`
- Generated TypeScript contract: `src/storefront-api.ts`
- Upstream source: `https://carto.build/openapi/storefront-v1.yaml`

The generated storefront server calls Carto with a server app token:

```http
Authorization: Bearer <sk_live...>
```

Do not expose that token in browser code. Keep calls to `/api/commerce/*` on the
server side or behind local Astro API routes.

To refresh the local API contract after Carto publishes an update:

```bash
npm run api:sync
```

`api:sync` downloads the OpenAPI YAML into `docs/storefront-v1.openapi.yaml` and
runs `openapi-typescript` to regenerate `src/storefront-api.ts`.
