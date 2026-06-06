export interface Money {
  amount?: number;
  currency?: string;
}

export interface ProductVariant {
  id?: string;
  title?: string;
  sku?: string;
  price?: Money | number;
  inventory?: number;
  options?: Record<string, string>;
}

export interface ProductImage {
  url: string;
  alt?: string;
}

export interface Product {
  id: string;
  slug: string;
  title: string;
  description?: string;
  summary?: string;
  price?: Money | number;
  currency?: string;
  inventory?: number;
  images?: ProductImage[] | string[];
  mainImage?: ProductImage | string;
  gallery?: ProductImage[] | string[];
  variants?: ProductVariant[];
  sellingPoints?: string[];
}

export interface PaymentProviderConfig {
  enabled: boolean;
  mode?: "sandbox" | "live" | string;
}

export interface PublicPaymentConfig {
  paypal?: PaymentProviderConfig & {
    clientId?: string;
  };
  stripe?: PaymentProviderConfig & {
    publishableKey?: string;
  };
}

export interface CommerceConfig {
  payments?: PublicPaymentConfig;
  payment?: PublicPaymentConfig;
}

export interface CheckoutPayload {
  productId: string;
  productSlug: string;
  variantId?: string;
  quantity: number;
  customer: {
    email: string;
    name: string;
    phone?: string;
  };
  provider: "paypal" | "stripe";
}
