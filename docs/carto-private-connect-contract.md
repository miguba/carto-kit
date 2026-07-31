# Carto Private contract required by `carto connect`

Carto Private does not currently expose a browser/device authorization flow for
Carto Kit. The existing Frontsite bootstrap route is authenticated with the
deployment's long-lived license token and must not be used by a developer CLI.
This document defines the small backend addition needed to activate `carto
connect`; it is not a mock API.

## 1. Start device authorization

`POST /api/cli/device-authorizations`

```json
{
  "client": "carto-kit",
  "projectName": "my-store",
  "requestedScopes": ["commerce:read", "commerce:write"]
}
```

Return `201` with an opaque, high-entropy `deviceCode`, short human `userCode`,
absolute `verificationUri`, and integer `expiresIn` / `interval` seconds. Store
only a hash of `deviceCode`. Codes expire within 10 minutes, are rate limited,
and are single-use. Do not set a login session or credential in this response.

## 2. Browser approval

The verification page requires the normal Carto user login. It shows the
project name, requested scopes, workspace and site selector, and lets an
authorized workspace developer select an existing suitable Server App or create
one. Creation uses the least scopes required by the current storefront:
`commerce:read` plus `commerce:write` because the shipped checkout creates
orders and payments. The page must allow denial and must never display a token
belonging to an existing app.

On approval, bind the authorization to the user, workspace, site and Server App.
If an app is created, mint a new token. A selected existing app must rotate/mint
a distinct credential rather than reveal a stored long-lived token.

## 3. Poll and one-time credential delivery

`POST /api/cli/device-authorizations/token`

```json
{ "deviceCode": "opaque-device-code" }
```

- Pending: `202 {"status":"authorization_pending"}`.
- Rate limited: `202 {"status":"slow_down"}`; the client adds 5 seconds.
- Denied, expired, invalid or already consumed: `400` with a stable error code.
- Approved: atomically consume the code and return `200` exactly once:

```json
{
  "apiBaseUrl": "https://carto.example.com",
  "token": "sk_live_one_time_delivery",
  "site": "shop.example.com",
  "serverApp": {
    "id": "01...",
    "name": "Carto Kit: my-store",
    "scopes": ["commerce:read", "commerce:write"]
  }
}
```

Responses must use `Cache-Control: no-store`; logs and analytics must redact
codes and tokens. Enforce polling interval, per-IP/device/user limits and CSRF
protection on browser approval. Audit approval, credential creation and denial.

## 4. Lifecycle

The resulting Server App stays site-scoped and can be revoked from the existing
Server Apps UI. Revocation immediately invalidates Commerce API calls. The UI
should identify Carto Kit-created credentials and expose last-used time. Never
use an administrator token or `CARTO_LICENSE_TOKEN` for this flow.
