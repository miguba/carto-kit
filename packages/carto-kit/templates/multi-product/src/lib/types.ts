export type Currency = 'USD' | 'CNY' | 'EUR' | 'GBP' | 'JPY' | 'HKD' | 'AUD' | 'CAD' | 'SGD';

export type Decoration = {
  domain?: string;
  pics?: string[];
  txts?: string[];
};

export type ProductVariant = {
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
  status: 'active' | 'inactive' | 'archived';
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  site: string;
  title: string;
  slug: string;
  status: 'draft' | 'active' | 'archived';
  currency: Currency;
  tags: string[];
  galleryImages: string[];
  mainImage: string | null;
  sellingPoints?: string[];
  selling_points?: string[];
  attributes?: Record<string, string>;
  specs?: Record<string, string>;
  decoration?: Decoration;
  video?: string | null;
  videoUrl?: string | null;
  video_url?: string | null;
  meta?: {
    video?: string | null;
    videoUrl?: string | null;
    video_url?: string | null;
    sellingPoints?: string[];
    selling_points?: string[];
    attributes?: Record<string, string>;
    specs?: Record<string, string>;
    decoration?: Decoration;
  } | null;
  description?: string | null;
  descriptionMd?: string | null;
  description_md?: string | null;
  descriptionMarkdown?: string | null;
  description_markdown?: string | null;
  content?: string | null;
  createdAt: string;
  updatedAt: string;
  variants: ProductVariant[];
  minPrice: number;
  maxPrice: number;
  totalStock: number;
};

export type OrderCustomer = {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
};

export type OrderAddress = {
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type OrderBillingAddress = OrderAddress;
export type OrderShippingAddress = OrderAddress;

export type OrderItem = {
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

export type OrderPayment = {
  id: string;
  site: string;
  orderId: string;
  provider: 'paypal' | 'stripe';
  fundingSource: string | null;
  providerOrderId: string | null;
  providerCaptureId: string | null;
  providerPayerId: string | null;
  status: 'created' | 'approved' | 'captured' | 'failed' | 'refunded';
  amount: number;
  currency: Currency;
  createdAt: string;
  updatedAt: string;
};

export type Order = {
  id: string;
  site: string;
  orderNo: string;
  status: 'pending' | 'processing' | 'done' | 'cancelled';
  paymentStatus: 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded';
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

export type ApiResponse<T> = {
  success: boolean;
  data: T;
};

export type CreateOrderRequest = {
  origin?: string;
  customer: OrderCustomer;
  billingAddress: OrderBillingAddress;
  billingAddressAsShippingAddress?: boolean;
  shippingAddress?: OrderShippingAddress;
  items: Array<{
    productSlug: string;
    sku: string;
    quantity: number;
  }>;
};

export type CreatePaymentResponse = {
  orderNo: string;
  provider: 'paypal' | 'stripe';
  fundingSource: string | null;
  providerOrderId: string;
  clientSecret?: string;
  currency: Currency;
  totalAmount: number;
  items: OrderItem[];
};
