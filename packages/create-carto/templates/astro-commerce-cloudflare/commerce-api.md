# Commerce Frontend API

Last updated: 2026-06-02

This document describes the external commerce HTTP APIs used by commerce
frontends and server-side integrations.

## Base URL

Production example:

```text
https://ems.example.com
```

Local development:

```text
http://localhost:4321
```

## Common Rules

All `/api/commerce/*` APIs require a Bearer token:

```http
Authorization: Bearer <server-app-token>
```

Create server apps in the EMS admin console under
`Shop Settings -> Apps & Credentials`. The full key is shown only once
when created. EMS stores only a SHA-256 hash of the token.

The token is bound to one EMS site, so API requests do not send
`X-Shop-Id` or `X-Site-Id`. EMS resolves the site from the token automatically.

Use the token from a server-side environment only. Do not expose it in browser
JavaScript.

Scopes:

| Scope            | Allows                                               |
| ---------------- | ---------------------------------------------------- |
| `commerce:read`  | `GET` APIs, such as products, decoration, config     |
| `commerce:write` | non-`GET` APIs, such as order and payment operations |

Responses are JSON:

```ts
type ApiResponse<T> = {
  success: boolean;
  data: T;
};
```

When an error occurs, `success` is `false` and `data` is usually an error
message string. Validation-heavy APIs may return a structured error object.

```json
{
  "success": false,
  "data": "Invalid server app token"
}
```

All amount fields stored by EMS are integers in the smallest currency unit, for example cents for `USD`. `1299` means `12.99`. Payment comparisons must be done against integer minor units, not JavaScript floating point amounts.

Supported product/order currencies:

```ts
type Currency =
  | 'USD'
  | 'CNY'
  | 'EUR'
  | 'GBP'
  | 'JPY'
  | 'HKD'
  | 'AUD'
  | 'CAD'
  | 'SGD';
```

## Data Types

### Product

```ts
type ProductStatus = 'draft' | 'active' | 'archived';
type ProductVariantStatus = 'active' | 'inactive' | 'archived';

type Decoration = {
  domain?: string;
  pics?: string[];
  txts?: string[];
};

type ProductMeta = {
  video?: string;
  sellingPoints?: string[];
  attributes?: Record<string, string>;
  decoration?: Decoration;
};

type ProductVariant = {
  id: string;
  productId: string;
  site: string;
  sku: string;
  optionValues: Record<string, string>;
  decoration: Decoration;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  image: string | null;
  status: ProductVariantStatus;
  createdAt: string;
  updatedAt: string;
};

type Product = {
  id: string;
  site: string;
  title: string;
  slug: string;
  status: ProductStatus;
  currency: Currency;
  tags: string[];
  galleryImages: string[];
  mainImage: string | null;
  meta: ProductMeta;
  content: string | null;
  createdAt: string;
  updatedAt: string;
  variants: ProductVariant[];
  minPrice: number;
  maxPrice: number;
  totalStock: number;
};
```

Public product APIs only return products whose `status` is `active`, and only return variants whose `status` is `active`.

### Order

```ts
type OrderStatus = 'pending' | 'processing' | 'done' | 'cancelled';
type OrderPaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded';
type PaymentProvider = 'paypal';
type PaymentRecordStatus =
  | 'created'
  | 'approved'
  | 'captured'
  | 'failed'
  | 'refunded';

type OrderCustomer = {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
};

type OrderAddress = {
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

type OrderBillingAddress = OrderAddress;
type OrderShippingAddress = OrderAddress;

type OrderItem = {
  id: string;
  orderId: string;
  site: string;
  productId: string;
  variantId: string;
  productSlug: string;
  productTitle: string;
  sku: string;
  optionValues: Record<string, string>;
  image: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  createdAt: string;
};

type OrderPayment = {
  id: string;
  site: string;
  orderId: string;
  provider: PaymentProvider;
  fundingSource: string | null;
  providerOrderId: string | null;
  providerCaptureId: string | null;
  providerPayerId: string | null;
  status: PaymentRecordStatus;
  amount: number;
  currency: Currency;
  createdAt: string;
  updatedAt: string;
};

type Order = {
  id: string;
  site: string;
  orderNo: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  currency: Currency;
  subtotalAmount: number;
  shippingAmount: number;
  taxAmount: number;
  totalAmount: number;
  itemCount: number;
  customer: OrderCustomer;
  billingAddress: OrderBillingAddress;
  shippingAddress: OrderShippingAddress;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  payments: OrderPayment[];
};
```

Public order detail and payment capture responses remove the internal `raw` payment payload.

## Product APIs

### List Products

```http
GET /api/commerce/products
Authorization: Bearer <server-app-token>
```

Query parameters:

| Name     | Type   | Required | Default | Description                                                                 |
| -------- | ------ | -------- | ------- | --------------------------------------------------------------------------- |
| `limit`  | number | No       | `20`    | Page size. Maximum is `100`.                                                |
| `offset` | number | No       | `0`     | Offset from the first matching product. Negative values are treated as `0`. |
| `q`      | string | No       | -       | Keyword search against product `title` and `slug`.                          |
| `tag`    | string | No       | -       | Tag filter. Current implementation uses fuzzy JSON text matching.           |

Success response:

```ts
ApiResponse<Product[]>;
```

Example:

```http
GET /api/commerce/products?limit=12&offset=0&q=shirt
Authorization: Bearer sk_live_xxx
```

```json
{
  "success": true,
  "data": [
    {
      "id": "01HX...",
      "site": "demo-shop",
      "title": "Classic Shirt",
      "slug": "classic-shirt",
      "status": "active",
      "currency": "USD",
      "tags": ["shirt"],
      "galleryImages": [],
      "mainImage": "https://...",
      "meta": {
        "video": "https://cdn.example.com/demo.mp4",
        "sellingPoints": [],
        "attributes": {},
        "decoration": {}
      },
      "content": "---\ntitle: Classic Shirt\n...",
      "createdAt": "2026-05-17T00:00:00.000Z",
      "updatedAt": "2026-05-17T00:00:00.000Z",
      "variants": [
        {
          "id": "01HY...",
          "productId": "01HX...",
          "site": "demo-shop",
          "sku": "SHIRT-BLACK-M",
          "optionValues": { "Color": "Black", "Size": "M" },
          "decoration": {},
          "price": 1999,
          "compareAtPrice": 2999,
          "stock": 10,
          "image": "https://...",
          "status": "active",
          "createdAt": "2026-05-17T00:00:00.000Z",
          "updatedAt": "2026-05-17T00:00:00.000Z"
        }
      ],
      "minPrice": 1999,
      "maxPrice": 1999,
      "totalStock": 10
    }
  ]
}
```

Common errors:

| HTTP Status | Message                         |
| ----------- | ------------------------------- |
| `401`       | `Invalid server app token`      |
| `403`       | `Insufficient server app scope` |
| `500`       | Internal error message          |

### Get Product Detail

```http
GET /api/commerce/products/{slug}
Authorization: Bearer <server-app-token>
```

Path parameters:

| Name   | Type   | Required | Description                                   |
| ------ | ------ | -------- | --------------------------------------------- |
| `slug` | string | Yes      | Product slug. It is normalized before lookup. |

Success response:

```ts
ApiResponse<Product>;
```

Example:

```http
GET /api/commerce/products/classic-shirt
Authorization: Bearer sk_live_xxx
```

Common errors:

| HTTP Status | Message                         |
| ----------- | ------------------------------- |
| `401`       | `Invalid server app token`      |
| `403`       | `Insufficient server app scope` |
| `400`       | `Missing product slug`          |
| `404`       | `Product not found`             |
| `500`       | Internal error message          |

### Content Plugin: Check Product Exists

Checks whether a product already exists based on the slug EMS would generate
from the product title. This endpoint checks products in any status (`draft`,
`active`, or `archived`) and is intended for importers or plugins that need to
avoid duplicate products before creating one.

```http
GET /api/products/exists?title={title}
X-Shop-Id: <shop-id>
```

Query parameters:

| Name                | Type   | Required | Description                                                                  |
| ------------------- | ------ | -------- | ---------------------------------------------------------------------------- |
| `title`             | string | Yes      | Product title. EMS generates the lookup slug from this value.                |
| `name`              | string | No       | Alias for `title`, used only when `title` is omitted.                        |
| `sourceProductId`   | string | No       | Optional source product id. When present, EMS appends it to the lookup slug. |
| `source_product_id` | string | No       | Alias for `sourceProductId`, used only when `sourceProductId` is omitted.    |

Success response:

```ts
ApiResponse<{
  exists: boolean;
  title: string;
  slug: string;
  product: null | {
    id: string;
    title: string;
    slug: string;
    status: ProductStatus;
    updatedAt: string;
  };
}>;
```

Example:

```http
GET /api/products/exists?title=Classic%20Shirt
X-Shop-Id: demo-shop
```

```json
{
  "success": true,
  "data": {
    "exists": true,
    "title": "Classic Shirt",
    "slug": "classic-shirt",
    "product": {
      "id": "01HX...",
      "title": "Classic Shirt",
      "slug": "classic-shirt",
      "status": "draft",
      "updatedAt": "2026-05-17T00:00:00.000Z"
    }
  }
}
```

Common errors:

| HTTP Status | Message                    |
| ----------- | -------------------------- |
| `400`       | `Missing X-Shop-Id header` |
| `400`       | `Missing product title`    |
| `400`       | `Invalid product title`    |
| `500`       | Internal error message     |

### Content Plugin: Import Product

Creates a product from an extension or other quick-entry tool. This endpoint is
currently public and does not require the EMS auth header.

Preferred usage is to send a complete Markdown document with YAML frontmatter in
`content`. Images and video should already be uploaded before calling this API,
so `mainImage`, `galleryImages`, Markdown image links, variant images, and
`video` should point to final EMS-accessible asset URLs or filenames.

```http
POST /api/products/import
Content-Type: application/json
X-Site-Id: <shop-id>
```

`X-Shop-Id` is also accepted for compatibility, but `X-Site-Id` is preferred.

Request body:

```ts
type ImportProductRequest = {
  content: string;
  source?: string;
  sourceProductId?: string;
  source_product_id?: string;
  sourceProductUrl?: string;
  source_product_url?: string;
};
```

Markdown content format:

```md
---
title: 12-in-1 Power Strip
slug: 12-in-1-power-strip
status: draft
currency: USD
mainImage: power-strip-main.png
galleryImages:
  - power-strip-1.png
  - power-strip-2.png
video: power-strip-demo.mp4
tags:
  - electronics
sellingPoints:
  - 8 AC outlets and 3 USB ports
  - Short cord with surge protection
attributes:
  Plug Type: US
  Ports: 12
decoration:
  pics:
    - promo-banner.png
  txts:
    - Limited time offer
variants:
  - sku: White
    optionValues:
      Color: White
    price: 10.16
    compareAtPrice: 17.42
    stock: 20
    image: power-strip-white.png
    status: active
  - sku: Black
    optionValues:
      Color: Black
    price: 10.16
    compareAtPrice: 17.42
    stock: 12
    image: power-strip-black.png
    status: active
---

Use Markdown for product detail content.

![](detail-1.png)

More text can be interleaved between detail images.

![](detail-2.png)
```

Frontmatter field rules:

| Field                                 | Rule                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| `title`                               | Required, non-empty string.                                                         |
| `slug`                                | Optional. Generated from `title` when omitted.                                      |
| `status`                              | Optional: `draft`, `active`, or `archived`.                                         |
| `currency`                            | Optional supported `Currency`. Defaults to `USD`.                                   |
| `mainImage` / `image`                 | Optional string. `image` is accepted as an alias.                                   |
| `galleryImages` / `images`            | Optional string array. `images` is accepted as an alias.                            |
| `video`                               | Optional string ending in `.mp4`, `.webm`, `.mov`, or `.m4v`.                       |
| `tags` / `keywords`                   | Optional string array.                                                              |
| `sellingPoints` / `bullets`           | Optional string array. Stored in `product.meta.sellingPoints`.                      |
| `attributes` / `specs`                | Optional object with scalar values. Stored in `product.meta.attributes` as strings. |
| `decoration`                          | Optional `Decoration`. Stored in `product.meta.decoration`.                         |
| `meta.source`                         | Optional source platform or collector name. Stored in `product.meta.source`.        |
| `meta.sourceProductId`                | Optional source product id. Stored in `product.meta.sourceProductId`.               |
| `meta.sourceProductUrl`               | Optional original source URL. Stored in `product.meta.sourceProductUrl`.            |
| `variants`                            | Optional array. Each item must have a non-empty `sku` if present.                   |
| `variants[].optionValues` / `options` | Optional object with scalar values.                                                 |
| `variants[].price`                    | Optional number in major currency units, for example `10.16`. Stored as cents.      |
| `variants[].compareAtPrice`           | Optional number or `null`, also stored as cents.                                    |
| `variants[].stock`                    | Optional integer.                                                                   |
| `variants[].status`                   | Optional: `active`, `inactive`, or `archived`.                                      |

Unknown frontmatter keys are rejected. Duplicate variant `id` or `sku` values
are rejected. For import compatibility, `source`, `sourceProductId` /
`source_product_id`, and `sourceProductUrl` / `source_product_url` may also be
sent at the request root or inside `product`; EMS stores them under
`product.meta`.

Success response:

```ts
type ImportProductResponse = {
  id: string;
  slug: string;
  status: ProductStatus;
  product: Product;
};

type Response = ApiResponse<ImportProductResponse>;
```

Example response:

```json
{
  "success": true,
  "data": {
    "id": "01K...",
    "slug": "12-in-1-power-strip",
    "status": "draft",
    "product": {
      "id": "01K...",
      "site": "demo-shop",
      "title": "12-in-1 Power Strip",
      "slug": "12-in-1-power-strip",
      "status": "draft",
      "currency": "USD",
      "tags": ["electronics"],
      "galleryImages": ["power-strip-1.png", "power-strip-2.png"],
      "mainImage": "power-strip-main.png",
      "meta": {
        "source": "collector-extension",
        "sourceProductId": "12345",
        "sourceProductUrl": "https://example.com/products/12345",
        "video": "power-strip-demo.mp4",
        "sellingPoints": ["8 AC outlets and 3 USB ports"],
        "attributes": { "Plug Type": "US", "Ports": "12" },
        "decoration": {}
      },
      "content": "---\ntitle: 12-in-1 Power Strip\n...",
      "createdAt": "2026-05-18T00:00:00.000Z",
      "updatedAt": "2026-05-18T00:00:00.000Z",
      "variants": [],
      "minPrice": 0,
      "maxPrice": 0,
      "totalStock": 0
    }
  }
}
```

Structured fallback:

If `content` is omitted, the endpoint can build Markdown from a structured
payload. This is kept for compatibility, but extensions should prefer `content`.

```ts
type ImportProductStructuredRequest = {
  source?: string;
  sourceProductId?: string;
  source_product_id?: string;
  sourceProductUrl?: string;
  source_product_url?: string;
  product?: Record<string, unknown>;

  // Product fields may also be provided at the root:
  title?: string;
  name?: string;
  slug?: string;
  status?: ProductStatus;
  currency?: Currency;
  mainImage?: string;
  main_image?: string;
  image?: string;
  mainImages?: Array<
    | string
    | { url?: string; sourceUrl?: string; source_url?: string; src?: string }
  >;
  main_images?: Array<
    | string
    | { url?: string; sourceUrl?: string; source_url?: string; src?: string }
  >;
  galleryImages?: Array<
    | string
    | { url?: string; sourceUrl?: string; source_url?: string; src?: string }
  >;
  gallery_images?: Array<
    | string
    | { url?: string; sourceUrl?: string; source_url?: string; src?: string }
  >;
  detailImages?: Array<
    | string
    | { url?: string; sourceUrl?: string; source_url?: string; src?: string }
  >;
  detail_images?: Array<
    | string
    | { url?: string; sourceUrl?: string; source_url?: string; src?: string }
  >;
  descriptionImages?: Array<
    | string
    | { url?: string; sourceUrl?: string; source_url?: string; src?: string }
  >;
  description_images?: Array<
    | string
    | { url?: string; sourceUrl?: string; source_url?: string; src?: string }
  >;
  video?: string;
  videoUrl?: string;
  video_url?: string;
  description?: string;
  descriptionMd?: string;
  description_md?: string;
  descriptionMarkdown?: string;
  description_markdown?: string;
  tags?: string[];
  sellingPoints?: string[];
  selling_points?: string[];
  bullets?: string[];
  attributes?: Record<string, unknown>;
  specs?: Record<string, unknown>;
  decoration?: Record<string, unknown>;
  variants?: Array<Record<string, unknown>>;
};
```

Common errors:

| HTTP Status | Message                                                    |
| ----------- | ---------------------------------------------------------- |
| `400`       | `Missing X-Site-Id header`                                 |
| `400`       | `Product title is required`                                |
| `400`       | `Invalid product import payload` with field-level `errors` |
| `400`       | Other product validation error message                     |

## Order APIs

### Create Order

Creates an order from active product variants. The backend calculates price totals from stored product variant prices.

```http
POST /api/commerce/orders
Content-Type: application/json
Authorization: Bearer <server-app-token>
```

Request body:

```ts
type CreateOrderRequest = {
  customer: {
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
  };
  billingAddress?: {
    address1: string;
    address2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  billingAddressAsShippingAddress?: boolean;
  shippingAddress?: OrderShippingAddress;
  items: Array<{
    productSlug: string;
    sku: string;
    quantity: number;
  }>;
};
```

Field rules:

| Field                             | Rule                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `customer.email`                  | Required, valid email. Trimmed and lowercased.                                                                                 |
| `customer.phone`                  | Required, non-empty string.                                                                                                    |
| `customer.firstName`              | Required, non-empty string.                                                                                                    |
| `customer.lastName`               | Required, non-empty string.                                                                                                    |
| `billingAddress`                  | Required for new clients. Legacy clients may continue sending only `shippingAddress`; it will also be used as billing address. |
| `billingAddress.*`                | Same shape and rules as `shippingAddress.*`. String values are trimmed and country is stored uppercase.                        |
| `billingAddressAsShippingAddress` | Optional boolean. Defaults to `true`. When `true`, `shippingAddress` may be omitted and is copied from `billingAddress`.       |
| `shippingAddress`                 | Required when `billingAddressAsShippingAddress` is `false`. Optional otherwise.                                                |
| `shippingAddress.address1`        | Required when `shippingAddress` is provided, non-empty string.                                                                 |
| `shippingAddress.address2`        | Optional. Defaults to empty string.                                                                                            |
| `shippingAddress.city`            | Required when `shippingAddress` is provided, non-empty string.                                                                 |
| `shippingAddress.state`           | Required when `shippingAddress` is provided, non-empty string.                                                                 |
| `shippingAddress.postalCode`      | Required when `shippingAddress` is provided, non-empty string.                                                                 |
| `shippingAddress.country`         | Required when `shippingAddress` is provided, 2-character country code. Stored uppercase.                                       |
| `items`                           | Required, at least 1 item. Duplicate `productSlug + sku` rows are merged.                                                      |
| `items[].productSlug`             | Required. Normalized before lookup.                                                                                            |
| `items[].sku`                     | Required, non-empty string.                                                                                                    |
| `items[].quantity`                | Required, positive integer.                                                                                                    |

All order items must belong to active products, active variants, and the same currency.

Success response:

```ts
ApiResponse<Order>;
```

Initial order values:

| Field            | Initial Value            |
| ---------------- | ------------------------ |
| `status`         | `pending`                |
| `paymentStatus`  | `unpaid`                 |
| `shippingAmount` | `0`                      |
| `taxAmount`      | `0`                      |
| `totalAmount`    | Same as `subtotalAmount` |
| `payments`       | `[]`                     |

Example:

```json
{
  "customer": {
    "email": "buyer@example.com",
    "phone": "+12025550123",
    "firstName": "Ada",
    "lastName": "Lovelace"
  },
  "billingAddress": {
    "address1": "123 Market St",
    "address2": "Apt 5",
    "city": "San Francisco",
    "state": "CA",
    "postalCode": "94105",
    "country": "US"
  },
  "billingAddressAsShippingAddress": true,
  "items": [
    {
      "productSlug": "classic-shirt",
      "sku": "SHIRT-BLACK-M",
      "quantity": 2
    }
  ]
}
```

Common errors:

| HTTP Status | Message                                      |
| ----------- | -------------------------------------------- |
| `401`       | `Invalid server app token`                   |
| `403`       | `Insufficient server app scope`              |
| `400`       | Zod validation error message                 |
| `400`       | `Product "{slug}" is not available`          |
| `400`       | `SKU "{sku}" is not available for "{slug}"`  |
| `400`       | `All order items must use the same currency` |

### Get Order Detail

```http
GET /api/commerce/orders/{orderNo}
Authorization: Bearer <server-app-token>
```

Path parameters:

| Name      | Type   | Required | Description                                        |
| --------- | ------ | -------- | -------------------------------------------------- |
| `orderNo` | string | Yes      | Public order number, for example `ORD20260517...`. |

Success response:

```ts
ApiResponse<Order>;
```

Example:

```http
GET /api/commerce/orders/ORD2026051701HYABC123
Authorization: Bearer sk_live_xxx
```

Common errors:

| HTTP Status | Message                         |
| ----------- | ------------------------------- |
| `401`       | `Invalid server app token`      |
| `403`       | `Insufficient server app scope` |
| `400`       | `Missing order number`          |
| `404`       | `Order not found`               |

## Payment APIs

The current payment provider is PayPal only.

Recommended frontend flow:

1. Fetch public payment configuration with `GET /api/commerce/config` to initialize payment SDKs (e.g., PayPal JS SDK).
2. Create an order with `POST /api/commerce/orders`.
3. Create a PayPal provider order with `POST /api/commerce/payments/create`.
4. Approve the returned `providerOrderId` in the PayPal frontend SDK.
5. Capture the PayPal payment with `POST /api/commerce/payments/capture`.
6. Use the returned order, or refetch `GET /api/commerce/orders/{orderNo}`, to show payment/order status.
7. On the paid success page, show `checkout.successNotice` from `GET /api/commerce/config` and display the EMS `orderNo` so the buyer knows to check email and save the order id.

Frontend payment-status rules:

- Treat only the EMS API response as authoritative. A success page must not mark an order as paid from URL query parameters such as `?status=paid`, local state, or a PayPal approve callback alone.
- Show the paid/confirmed state only when the captured order, or a fresh order detail response, has `paymentStatus: 'paid'`.
- If `POST /api/commerce/payments/capture` fails or returns a non-paid order, show a payment failure or pending state and let the buyer retry or contact support.
- Use `GET /api/commerce/config` for the PayPal SDK `clientId` and environment mode. Do not hardcode a PayPal sandbox/live client ID in the commerce frontend; the EMS site configuration decides which PayPal environment is active.
- EMS only sets `paymentStatus: 'paid'` after a verified PayPal capture with a capture id, matching amount, and matching currency. After capture, EMS also queries PayPal order details with the same site PayPal credentials and verifies the returned payment again. Admin/manual order updates must not be used as a payment confirmation path.
- Bank/card available-credit changes or pending authorizations are not payment confirmation. They may be temporary holds. The commerce frontend must rely on EMS/PayPal capture status, not the card issuer UI.

PayPal Card Fields notes:

- For PayPal hosted card fields, first create the EMS order and provider order with `fundingSource: "card"`, then pass the EMS `providerOrderId` into the PayPal Card Fields flow.
- Card-funded PayPal provider orders are created with `payment_source.card.attributes.verification.method = "SCA_WHEN_REQUIRED"` so PayPal can trigger 3D Secure only when required by risk/SCA rules. Shipping is sent through `purchase_units[].shipping`.
- For PayPal Card Fields, pass the cardholder name and billing address in the frontend `cardFields.submit({ billingAddress: ... })` call. Do not send cardholder name or card billing address in the backend Create Order `payment_source.card` payload; PayPal's Card Fields iframe confirms the card source during submit.
- Call `cardFields.submit()` or the equivalent PayPal Card Fields confirmation method and wait for it to complete before calling `POST /api/commerce/payments/capture`.
- If PayPal triggers a 3D Secure challenge during `cardFields.submit()`, keep the buyer in the checkout flow until the challenge succeeds, fails, or is cancelled. Do not call EMS capture when the buyer cancels or the card confirmation fails.
- Do not call EMS capture immediately after rendering card fields or immediately after validating local form fields. The buyer/card confirmation step must complete first.
- If PayPal Card Fields returns `UNPROCESSABLE_ENTITY` with `issue: "PAYER_CANNOT_PAY"` from `/v2/checkout/orders/{providerOrderId}/confirm-payment-source`, the payer/card cannot be used for this transaction. Do not call EMS capture for that provider order. Keep the EMS order unpaid/pending or failed in the commerce frontend UI, show a retry message, and ask the buyer to use another card/payment method or contact the card issuer/PayPal.
- If EMS capture returns an error such as `Verified PayPal capture did not complete: CREATED`, the PayPal order has not been verified as captured. Keep the buyer on the checkout failure/pending state and do not show an order-confirmed page.
- A PayPal order status of `CREATED`, `SAVED`, `PAYER_ACTION_REQUIRED`, or any non-`COMPLETED` status is not paid. Only EMS returning `paymentStatus: 'paid'` after capture verification is paid.

### Get Commerce Decoration

Returns configurable commerce decoration blocks stored in
`site.config.decorations`. This is the commerce-facing endpoint for shop
frontends. The legacy `/api/site/decoration` endpoint is kept only for backward
compatibility.

```http
GET /api/commerce/decoration
Authorization: Bearer <server-app-token>
```

Use `key` to fetch one section:

```http
GET /api/commerce/decoration?key=home-hero
Authorization: Bearer <server-app-token>
```

Success response:

```ts
type DecorationItem = Record<string, unknown>;

type Response =
  | ApiResponse<Record<string, DecorationItem[]>>
  | ApiResponse<DecorationItem[]>;
```

Common errors:

| HTTP Status | Message                         |
| ----------- | ------------------------------- |
| `401`       | `Invalid server app token`      |
| `403`       | `Insufficient server app scope` |
| `500`       | Internal error message          |

### Get Commerce Config

Returns the public payment configuration required by the commerce frontend (excluding sensitive credentials like PayPal `clientSecret` and Stripe `secretKey`).

Each payment method is only enabled when its site config has `enabled: true` and the public credential for the selected mode is present.

PayPal Card Fields should only be shown when `payments.paypal.creditCardEnabled` is `true`. Existing PayPal configs without this field are treated as credit-card-enabled for backward compatibility; set `payments.paypal.creditCardEnabled: false` to disable card-funded PayPal orders.

The returned PayPal `mode` and `clientId` are scoped to the Bearer token site. The commerce frontend should initialize the PayPal SDK with this returned `clientId` so the browser SDK and EMS backend use the same sandbox/live environment.

The returned Stripe `mode` and `publishableKey` are also scoped to the Bearer token site. The commerce frontend should initialize Stripe.js with this returned `publishableKey`.

```http
GET /api/commerce/config
Authorization: Bearer <server-app-token>
```

Success response:

```ts
type CommerceConfigResponse = {
  checkout: {
    successNotice: string;
  };
  payments: {
    paypal: {
      enabled: boolean;
      creditCardEnabled: boolean;
      mode: 'sandbox' | 'live';
      clientId: string;
    };
    stripe: {
      enabled: boolean;
      mode: 'test' | 'live';
      publishableKey: string;
    };
  };
};

type Response = ApiResponse<CommerceConfigResponse>;
```

Example response:

```json
{
  "success": true,
  "data": {
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
    },
    "checkout": {
      "successNotice": "Payment successful. Please check your email for the order confirmation and save your Order ID for future reference."
    }
  }
}
```

Common errors:

| HTTP Status | Message                         |
| ----------- | ------------------------------- |
| `401`       | `Invalid server app token`      |
| `403`       | `Insufficient server app scope` |
| `500`       | Internal error message          |

### Create Payment

Creates or reuses a pending provider payment for an existing IMS order.

```http
POST /api/commerce/payments/create
Content-Type: application/json
Authorization: Bearer <server-app-token>
```

Request body:

```ts
type CreatePaymentRequest = {
  orderNo: string;
  provider: 'paypal' | 'stripe';
  fundingSource?: string; // PayPal only: use "card" for PayPal Card Fields; use "paypal" for wallet checkout
};
```

EMS rejects requests for providers that are not enabled in the site payment config.
EMS also rejects PayPal card-funded requests when `payments.paypal.creditCardEnabled` is explicitly `false`.

Success response:

```ts
type CreatePaymentResponse = {
  orderNo: string;
  provider: 'paypal' | 'stripe';
  fundingSource: string | null;
  providerOrderId: string; // PayPal order id or Stripe PaymentIntent id
  clientSecret?: string; // Stripe only: PaymentIntent client secret for Stripe.js
  currency: Currency;
  totalAmount: number;
  items: OrderItem[];
};

type Response = ApiResponse<CreatePaymentResponse>;
```

Notes:

- If an existing `created` PayPal payment record exists for the order and the requested `fundingSource` matches, the API returns that existing `providerOrderId`.
- Existing pending PayPal provider orders are reused only when the requested `fundingSource` matches. This prevents a wallet order from being reused for card fields, because card-funded orders need PayPal card/3D Secure configuration.
- Card-funded pending PayPal provider orders are reused only when they were created with the current EMS card order schema version. Older card orders are skipped and a new provider order is created, because PayPal rejects unsupported card payment-source fields during Card Fields confirmation.
- Card-funded PayPal Create Order requests use a schema-versioned `PayPal-Request-Id`, so PayPal does not return an older idempotent provider order created with a previous unsupported Card Fields payload.
- When `fundingSource` is `"card"`, EMS creates the PayPal order with a Card Fields-compatible `payment_source.card.attributes.verification.method = "SCA_WHEN_REQUIRED"` payload. Shipping remains on `purchase_units[].shipping`; cardholder name and card billing address must be submitted from the commerce frontend through `cardFields.submit(...)`.
- When `fundingSource` is omitted or `"paypal"`, EMS creates a PayPal wallet order and passes customer name/email plus the provided shipping address.
- When `provider` is `"stripe"`, EMS creates a Stripe PaymentIntent with automatic payment methods, order metadata, customer email, and shipping address. The response includes `clientSecret`; use it with Stripe.js / Payment Element to confirm the payment.
- Existing pending Stripe PaymentIntent records are reused for the order while they remain `created`.
- If successful, order `paymentStatus` becomes `pending`.

Example:

```json
{
  "orderNo": "ORD2026051701HYABC123",
  "provider": "paypal",
  "fundingSource": "paypal"
}
```

Card Fields example:

```json
{
  "orderNo": "ORD2026051701HYABC123",
  "provider": "paypal",
  "fundingSource": "card"
}
```

Stripe example:

```json
{
  "orderNo": "ORD2026051701HYABC123",
  "provider": "stripe"
}
```

Common errors:

| HTTP Status | Message                                         |
| ----------- | ----------------------------------------------- |
| `401`       | `Invalid server app token`                      |
| `403`       | `Insufficient server app scope`                 |
| `400`       | Zod validation error message                    |
| `400`       | `Unsupported payment provider: {provider}`      |
| `400`       | `Order not found`                               |
| `400`       | `Order is already paid`                         |
| `400`       | `Cancelled orders cannot be paid`               |
| `400`       | `PayPal credit card payment is not enabled`     |
| `400`       | `PayPal credentials are not configured`         |
| `400`       | `Failed to create PayPal order`                 |
| `400`       | `Stripe test/live secret key is not configured` |
| `400`       | Stripe API error message                        |

### Capture Payment

Captures or verifies a provider payment after the buyer approves it in the provider frontend SDK.

This endpoint is the step that converts an EMS order to paid. A PayPal frontend approval or Stripe frontend confirmation only means the provider flow completed in the browser; the commerce frontend or server-side integration must still call this endpoint and wait for a successful EMS response before showing a paid confirmation.

```http
POST /api/commerce/payments/capture
Content-Type: application/json
Authorization: Bearer <server-app-token>
```

Request body:

```ts
type CapturePaymentRequest = {
  orderNo: string;
  provider: 'paypal' | 'stripe';
  providerOrderId: string; // PayPal order id or Stripe PaymentIntent id
};
```

Success response:

```ts
ApiResponse<Order>;
```

On successful capture:

| Field                       | Value                                 |
| --------------------------- | ------------------------------------- |
| `order.status`              | `processing`                          |
| `order.paymentStatus`       | `paid`                                |
| `payment.status`            | `captured`                            |
| `payment.providerCaptureId` | PayPal capture id or Stripe charge id |
| `payment.providerPayerId`   | PayPal payer id, when returned        |

Capture validation requirements:

- PayPal capture must complete with `COMPLETED` status.
- PayPal response must include a capture id.
- Captured amount and currency must exactly match the EMS order total and currency.
- The captured provider order id must match the pending payment record for the EMS order.
- EMS must query PayPal order details after capture using the configured site PayPal credentials and repeat the id, invoice/order number, status, amount, and currency checks before storing `paymentStatus: 'paid'`.
- EMS stores PayPal risk details in the payment `raw.riskDetails` object when returned by PayPal, including `processorResponse`, `authenticationResult`, `avsCode`, `cvvCode`, `responseCode`, `liabilityShift`, and `threeDSecure`. Commerce clients should still treat the EMS capture response as the source of truth for paid/unpaid status.
- Stripe PaymentIntent verification must retrieve the PaymentIntent using the configured site Stripe secret key.
- Stripe PaymentIntent status must be `succeeded`.
- Stripe PaymentIntent amount, currency, id, and `metadata.orderNo` must match the EMS order and pending payment record.
- Stripe PaymentIntent must include a `latest_charge` id before EMS stores `paymentStatus: 'paid'`.

Example:

```json
{
  "orderNo": "ORD2026051701HYABC123",
  "provider": "paypal",
  "providerOrderId": "9AB12345CD6789012"
}
```

Stripe example:

```json
{
  "orderNo": "ORD2026051701HYABC123",
  "provider": "stripe",
  "providerOrderId": "pi_123456789"
}
```

Common errors:

| HTTP Status | Message                                                 |
| ----------- | ------------------------------------------------------- |
| `401`       | `Invalid server app token`                              |
| `403`       | `Insufficient server app scope`                         |
| `400`       | Zod validation error message                            |
| `400`       | `Unsupported payment provider: {provider}`              |
| `400`       | `Order not found`                                       |
| `400`       | `Order is already paid`                                 |
| `400`       | `Payment record not found for this order`               |
| `400`       | `Payment is already captured`                           |
| `400`       | `Captured PayPal amount does not match the order total` |
| `400`       | `PayPal capture did not complete: {status}`             |
| `400`       | `Failed to capture PayPal order`                        |
| `400`       | `Stripe PaymentIntent amount does not match the order`  |
| `400`       | `Stripe PaymentIntent did not succeed: {status}`        |

If capture fails after a payment record is found, the payment record is usually marked `failed` and the order `paymentStatus` is marked `failed`. Stripe PaymentIntent statuses that can still complete, such as `processing` or `requires_action`, remain pending instead of being treated as paid.

### PayPal Fulfillment Tracking

When admin fulfillment data is updated with both `fulfillment.trackingNo` and `fulfillment.carrier`, EMS automatically attempts to sync tracking to PayPal for captured PayPal payments.

Tracking sync behavior:

- Sync runs only after the EMS order has a captured PayPal payment with both `providerOrderId` and `providerCaptureId`.
- EMS calls PayPal Orders Tracking API `POST /v2/checkout/orders/{providerOrderId}/track` with the captured PayPal `capture_id`, tracking number, and carrier.
- US carrier inputs are normalized for PayPal carrier enums: `USPS`, `UPS`, `FEDEX`, and `DHL` are sent directly. Unknown or non-enum carriers are sent as `OTHER` with the original carrier name in `carrier_name_other`.
- `notify_payer` is currently `false`; EMS saves tracking to PayPal without asking PayPal to send the buyer an extra tracking email.
- Successful sync is stored under `payment.raw.tracking` with `status: "synced"`, the tracking number, carrier, capture id, and PayPal response.
- Failed sync is stored under `payment.raw.tracking` with `status: "failed"` and the error message. The EMS fulfillment update is not rolled back, so staff can correct the carrier/tracking number and save again.
- No database migration is required for this behavior because the sync result is stored in the existing payment `raw` JSON field.
