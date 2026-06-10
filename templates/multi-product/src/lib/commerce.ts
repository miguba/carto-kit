import { COMMERCE_API_TOKEN } from "astro:env/server";

import { cachePage } from "./cache-page";
import { getCommerceConfig, setCommerceMediaConfig, type CommerceMediaConfig } from "./config";
import { getPageCacheBinding } from "./page-cache-binding";
import type {
  ApiResponse,
  BlocksByKey,
  CreateOrderRequest,
  CreatePaymentResponse,
  Order,
  Product,
} from "./types";

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

export type CommerceReadCacheOptions = {
  refresh?: boolean;
  ttl?: number;
  kvCache?: KVNamespace;
};

export class CommerceApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CommerceApiError";
    this.status = status;
  }
}

export async function commerceRequest<T>(
  path: string,
  options: RequestOptions = {},
) {
  const { apiBaseUrl } = getCommerceConfig();

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${COMMERCE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new CommerceApiError(
      `Commerce API returned ${response.status}`,
      response.status,
    );
  }

  if (!response.ok || !payload.success) {
    const message =
      typeof payload.data === "string"
        ? payload.data
        : `Commerce API returned ${response.status}`;
    throw new CommerceApiError(message, response.status);
  }

  return payload.data;
}

async function cachedCommerceRead<T>(
  cacheKey: string,
  fun: () => Promise<T>,
  { refresh = false, ttl, kvCache }: CommerceReadCacheOptions = {},
) {
  const { data } = await cachePage<T>(cacheKey, {
    fun,
    refresh,
    ttl,
    kvCache: kvCache ?? (await getPageCacheBinding()),
  });

  return data;
}

export function getProduct(
  slug: string,
  cacheOptions?: CommerceReadCacheOptions,
) {
  return cachedCommerceRead(
    `commerce:product:${slug}`,
    () =>
      commerceRequest<Product>(
        `/api/commerce/products/${encodeURIComponent(slug)}`,
      ),
    cacheOptions,
  );
}

export function getProducts(
  limit = 12,
  cacheOptions?: CommerceReadCacheOptions,
) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: "0",
  });

  return cachedCommerceRead(
    `commerce:products:${limit}:0`,
    () =>
      commerceRequest<Product[]>(
        `/api/commerce/products?${params.toString()}`,
      ),
    cacheOptions,
  );
}

export function getBlocksByKeys(
  keys: string[],
  cacheOptions?: CommerceReadCacheOptions,
) {
  const cacheKeys = [...new Set(keys)].sort();
  const params = new URLSearchParams({
    keys: cacheKeys.join(","),
  });

  return cachedCommerceRead(
    `commerce:blocks:${cacheKeys.join("|")}`,
    () =>
      commerceRequest<BlocksByKey>(
        `/api/commerce/blocks?${params.toString()}`,
      ),
    cacheOptions,
  );
}

export function getOrder(orderNo: string) {
  return commerceRequest<Order>(
    `/api/commerce/orders/${encodeURIComponent(orderNo)}`,
  );
}

export function createOrder(body: CreateOrderRequest) {
  return commerceRequest<Order>("/api/commerce/orders", {
    method: "POST",
    body,
  });
}

export type PaymentProvider = "paypal" | "stripe";

export function createPayment(
  orderNo: string,
  provider: PaymentProvider,
  fundingSource?: string,
) {
  return commerceRequest<CreatePaymentResponse>(
    "/api/commerce/payments/create",
    {
      method: "POST",
      body: {
        orderNo,
        provider,
        fundingSource,
      },
    },
  );
}

export function capturePayment(
  orderNo: string,
  provider: PaymentProvider,
  providerOrderId: string,
) {
  return commerceRequest<Order>("/api/commerce/payments/capture", {
    method: "POST",
    body: {
      orderNo,
      provider,
      providerOrderId,
    },
  });
}

export type CommerceConfigResponse = {
  site: SiteConfig;
  media?: CommerceMediaConfig;
  payments: {
    paypal: {
      enabled: boolean;
      mode: "sandbox" | "live";
      clientId: string;
      creditCardEnabled?: boolean;
      cardEnabled?: boolean;
      card?: {
        enabled?: boolean;
      };
    };
    stripe: {
      enabled: boolean;
      mode: "test" | "live";
      publishableKey: string;
    };
  };
  checkout: {
    successNotice: string;
  };
};

export async function getCommerceConfigFromServer(
  cacheOptions?: CommerceReadCacheOptions,
) {
  const config = await cachedCommerceRead(
    "commerce:config",
    () => commerceRequest<CommerceConfigResponse>("/api/commerce/config"),
    cacheOptions,
  );
  const mediaConfig = {
    cdnBaseUrl: config.media?.cdnBaseUrl ?? config.site.cdnBaseUrl,
  };

  setCommerceMediaConfig(mediaConfig);

  return {
    ...config,
    media: mediaConfig,
  };
}

export type SiteConfig = {
  name: string;
  legalName: string;
  domain: string;
  supportEmail: string;
  cdnBaseUrl?: string | null;
  logo?: string | null;
  logoUrl?: string | null;
  logoImage?: string | null;
  brandLogo?: string | null;
  logoAlt?: string | null;
};

export async function getSiteConfigFromServer(
  cacheOptions?: CommerceReadCacheOptions,
) {
  const config = await getCommerceConfigFromServer(cacheOptions);
  return config.site;
}
