# EMS Requirement: Extend `/api/commerce/config` With Storefront Site Metadata

## Background

Carto storefront should not maintain storefront display, legal, customer support, privacy, or policy metadata in its own `.env` file.

These fields belong to EMS site configuration. EMS should be the single source of truth and expose them to storefronts through the existing commerce config API.

Carto plans to remove these environment variables from the storefront template:

```env
PUBLIC_SITE_NAME
PUBLIC_SITE_LEGAL_NAME
PUBLIC_SITE_DOMAIN
PUBLIC_SUPPORT_EMAIL
PUBLIC_PRIVACY_EMAIL
PUBLIC_SUPPORT_RESPONSE_TIME
PUBLIC_POLICY_UPDATED_AT
PUBLIC_COPYRIGHT_YEAR
```

Carto should instead read them from:

```http
GET /api/commerce/config
```

## Requirement

Extend the response of `GET /api/commerce/config`.

Keep the existing `payments` and `checkout` fields compatible, and add a new top-level `site` field.

## Target Response Type

```ts
type CommerceConfigResponse = {
  site: {
    name: string;
    legalName: string;
    domain: string;
    supportEmail: string;
    privacyEmail: string;
    supportResponseTime: string;
    policyUpdatedAt: string;
    copyrightYear: string;
    registeredAddress?: string;
  };

  checkout: {
    successNotice: string;
  };

  payments: {
    paypal: {
      enabled: boolean;
      creditCardEnabled: boolean;
      mode: "sandbox" | "live";
      clientId: string;
    };

    stripe: {
      enabled: boolean;
      mode: "test" | "live";
      publishableKey: string;
    };
  };
};
```

## Field Descriptions

| Field | Description | Example |
| --- | --- | --- |
| `site.name` | Storefront display name | `Wonder Box` |
| `site.legalName` | Legal business name | `Wonder Box Limited` |
| `site.domain` | Storefront domain | `example.com` |
| `site.supportEmail` | Customer support email | `support@example.com` |
| `site.privacyEmail` | Privacy request email | `privacy@example.com` |
| `site.supportResponseTime` | Customer support response time copy | `1-2 business days` |
| `site.policyUpdatedAt` | Policy updated date copy | `June 5, 2026` |
| `site.copyrightYear` | Copyright year | `2026` |
| `site.registeredAddress` | Registered business address, optional | `FLAT/RM 1405A, 14/F...` |

## Example Response

```json
{
  "success": true,
  "data": {
    "site": {
      "name": "Wonder Box",
      "legalName": "Wonder Box Limited",
      "domain": "example.com",
      "supportEmail": "support@example.com",
      "privacyEmail": "privacy@example.com",
      "supportResponseTime": "1-2 business days",
      "policyUpdatedAt": "June 5, 2026",
      "copyrightYear": "2026",
      "registeredAddress": "FLAT/RM 1405A, 14/F, THE BELGIAN BANK BUILDING, NOS.721-725 NATHAN ROAD, MONGKOK, KL, HONG KONG"
    },
    "checkout": {
      "successNotice": "Payment successful. Please check your email for the order confirmation and save your Order ID for future reference."
    },
    "payments": {
      "paypal": {
        "enabled": true,
        "creditCardEnabled": true,
        "mode": "sandbox",
        "clientId": "AaBb..."
      },
      "stripe": {
        "enabled": true,
        "mode": "test",
        "publishableKey": "pk_test_..."
      }
    }
  }
}
```

## Implementation Requirements

- The new `site` field must contain public metadata only.
- Do not return secrets.
- The response must be scoped to the site represented by the Bearer token.
- Carto storefront should not keep local env fallback values for these fields.
- If required site metadata is missing, EMS should either provide explicit defaults or return a clear configuration error.
- Existing `payments` and `checkout` response fields must remain backward-compatible.
- Update `commerce-api.md` with the new response type and example response.

## Suggested EMS Implementation Areas

Please verify the exact code paths in EMS, but the likely areas are:

- `src/dto/site.dto.ts`
- `src/db/schema.ts`
- Site admin default configuration
- Site admin edit UI
- Current `/api/commerce/config` handler or service
- `commerce-api.md`

## Acceptance Criteria

- `GET /api/commerce/config` returns a top-level `site` field.
- `site` includes storefront display name, legal name, domain, support email, privacy email, support response time, policy updated date, copyright year, and optional registered address.
- `payments` and `checkout` remain compatible with the existing contract.
- No secrets are returned.
- Existing PayPal and Stripe checkout configuration is not broken.
- `commerce-api.md` documents the new response type and example response.
