import { EMS_API_BASE_URL, getServerHeaders } from "./config";
import type { CheckoutPayload, CommerceConfig, Product } from "./types";

interface ApiEnvelope<T> {
  data?: T;
  products?: Product[];
  product?: Product;
  config?: CommerceConfig;
  items?: T;
}

export class EmsApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export async function fetchProducts(): Promise<Product[]> {
  const payload = await request<ApiEnvelope<Product[]> | Product[]>("/api/commerce/products");
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.products)) return payload.products;
  return [];
}

export async function fetchProduct(slug: string): Promise<Product | null> {
  try {
    const payload = await request<ApiEnvelope<Product> | Product>(`/api/commerce/products/${encodeURIComponent(slug)}`);
    if ("data" in payload && payload.data) return payload.data;
    if ("product" in payload && payload.product) return payload.product;
    return payload as Product;
  } catch (error) {
    if (error instanceof EmsApiError && error.status === 404) return null;
    throw error;
  }
}

export async function fetchCommerceConfig(): Promise<CommerceConfig> {
  const payload = await request<ApiEnvelope<CommerceConfig> | CommerceConfig>("/api/commerce/config");
  if ("data" in payload && payload.data) return payload.data;
  if ("config" in payload && payload.config) return payload.config;
  return payload as CommerceConfig;
}

export async function createCheckout(payload: CheckoutPayload): Promise<unknown> {
  return request("/api/commerce/orders", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${EMS_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...getServerHeaders(),
      "content-type": "application/json",
      ...init.headers
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new EmsApiError(`EMS API request failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`, response.status);
  }

  return response.json() as Promise<T>;
}
