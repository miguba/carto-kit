import { COMMERCE_API_TOKEN } from "astro:env/server";

import { getCommerceConfig, setCommerceMediaConfig, type CommerceMediaConfig } from "./config";
import type {
  ApiResponse,
  CreateOrderRequest,
  CreatePaymentResponse,
  Order,
  Product,
} from "./types";

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
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

export function getProduct(slug: string) {
  return commerceRequest<Product>(
    `/api/commerce/products/${encodeURIComponent(slug)}`,
  );
}

export function getProducts(limit = 12) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: "0",
  });

  return commerceRequest<Product[]>(
    `/api/commerce/products?${params.toString()}`,
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

export async function getCommerceConfigFromServer() {
  const config = await commerceRequest<CommerceConfigResponse>("/api/commerce/config");
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
  privacyEmail: string;
  supportResponseTime: string;
  policyUpdatedAt: string;
  copyrightYear: string;
  cdnBaseUrl?: string | null;
  registeredAddress?: string;
};

export async function getSiteConfigFromServer() {
  const config = await getCommerceConfigFromServer();
  return config.site;
}
