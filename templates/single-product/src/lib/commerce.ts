import { COMMERCE_API_TOKEN } from 'astro:env/server';
import { cachePage } from './cache-page';
import {
  getCommerceConfig,
  setCommerceMediaConfig,
  type CommerceMediaConfig,
} from './config';
import { getPageCacheBinding } from './page-cache-binding';
import type {
  ApiResponse,
  CreateOrderRequest,
  CreatePaymentResponse,
  Order,
  Product,
} from './types';

type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
};

type CacheOptions = {
  refresh?: boolean;
  ttl?: number;
  kvCache?: KVNamespace;
};

class CommerceApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CommerceApiError';
    this.status = status;
  }
}

async function commerceRequest<T>(path: string, options: RequestOptions = {}) {
  const { apiBaseUrl } = getCommerceConfig();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${COMMERCE_API_TOKEN}`,
      'Content-Type': 'application/json',
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
      typeof payload.data === 'string'
        ? payload.data
        : `Commerce API returned ${response.status}`;
    throw new CommerceApiError(message, response.status);
  }

  return payload.data;
}

export function getProduct(slug: string) {
  return commerceRequest<Product>(
    `/api/commerce/products/${encodeURIComponent(slug)}`,
  );
}

export async function getCachedProduct(
  slug: string,
  options: CacheOptions = {},
) {
  const kvCache = await resolveKvCache(options.kvCache);
  const { data } = await cachePage<Product>(`product:${slug}`, {
    async fun() {
      return getProduct(slug);
    },
    refresh: options.refresh,
    ttl: options.ttl,
    kvCache,
  });

  return data;
}

export function getDecoration(key: string) {
  return commerceRequest<unknown[]>(
    `/api/commerce/decoration?key=${encodeURIComponent(key)}`,
  );
}

export async function getCachedDecoration(
  key: string,
  options: CacheOptions = {},
) {
  const kvCache = await resolveKvCache(options.kvCache);
  const { data } = await cachePage<unknown[]>(`decoration:${key}`, {
    async fun() {
      return getDecoration(key);
    },
    refresh: options.refresh,
    ttl: options.ttl,
    kvCache,
  });

  return data;
}

export type CommerceBlock = {
  key: string;
  type: string;
  meta: Record<string, unknown>;
  content: string;
  updatedAt: string;
};

export function getBlocksByKeys(keys: string[]) {
  const encodedKeys = keys.map((key) => key.trim()).filter(Boolean);
  if (!encodedKeys.length) {
    return Promise.resolve({} as Record<string, CommerceBlock>);
  }

  return commerceRequest<Record<string, CommerceBlock>>(
    `/api/commerce/blocks?keys=${encodeURIComponent(encodedKeys.join(','))}`,
  );
}

export async function getCachedBlocksByKeys(
  keys: string[],
  options: CacheOptions = {},
) {
  const encodedKeys = keys.map((key) => key.trim()).filter(Boolean);
  if (!encodedKeys.length) {
    return {} as Record<string, CommerceBlock>;
  }

  const cacheKey = `blocks:${[...encodedKeys].sort().join(',')}`;
  const kvCache = await resolveKvCache(options.kvCache);
  const { data } = await cachePage<Record<string, CommerceBlock>>(cacheKey, {
    async fun() {
      return getBlocksByKeys(encodedKeys);
    },
    refresh: options.refresh,
    ttl: options.ttl,
    kvCache,
  });

  return data;
}

export function getOrder(orderNo: string) {
  return commerceRequest<Order>(
    `/api/commerce/orders/${encodeURIComponent(orderNo)}`,
  );
}

export function createOrder(body: CreateOrderRequest) {
  return commerceRequest<Order>('/api/commerce/orders', {
    method: 'POST',
    body,
  });
}

export function createPayment(orderNo: string, fundingSource?: string) {
  return commerceRequest<CreatePaymentResponse>(
    '/api/commerce/payments/create',
    {
      method: 'POST',
      body: {
        orderNo,
        provider: 'paypal',
        fundingSource,
      },
    },
  );
}

export function capturePayment(orderNo: string, providerOrderId: string) {
  return commerceRequest<Order>('/api/commerce/payments/capture', {
    method: 'POST',
    body: {
      orderNo,
      provider: 'paypal',
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
      mode: 'sandbox' | 'live';
      clientId: string;
    };
  };
};

export async function getCommerceConfigFromServer() {
  const config = await commerceRequest<CommerceConfigResponse>(
    '/api/commerce/config',
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

export async function getCachedCommerceConfigFromServer(
  options: CacheOptions = {},
) {
  const kvCache = await resolveKvCache(options.kvCache);
  const { data } = await cachePage<
    Awaited<ReturnType<typeof getCommerceConfigFromServer>>
  >('commerce-config', {
    async fun() {
      return getCommerceConfigFromServer();
    },
    refresh: options.refresh,
    ttl: options.ttl,
    kvCache,
  });

  setCommerceMediaConfig(data.media);

  return data;
}

export type SiteConfig = {
  name: string;
  legalName: string;
  domain: string;
  supportEmail: string;
  cdnBaseUrl?: string | null;
};

async function resolveKvCache(kvCache: KVNamespace | undefined) {
  return kvCache ?? (await getPageCacheBinding());
}
