import { getCachedDecoration, getCachedProduct } from './commerce';
import type { Product } from './types';

const PURCHASE_PRODUCTS_DECORATION_KEY = 'purchase-products';

type PurchaseProductsMode = 'single' | 'group';

type PurchaseProductsConfig = {
  mode: PurchaseProductsMode;
  single?: {
    product?: {
      slug?: unknown;
    };
  };
  group?: {
    default?: unknown;
    products?: Array<{
      key?: unknown;
      label?: unknown;
      slug?: unknown;
    }>;
  };
  product?: {
    slug?: unknown;
  };
  default?: unknown;
  products?: Array<{
    key?: unknown;
    label?: unknown;
    slug?: unknown;
  }>;
};

export type PurchaseProductItem = {
  key: string;
  label: string;
  product: Product;
};

export type PurchaseProducts = {
  mode: PurchaseProductsMode;
  defaultKey: string;
  items: PurchaseProductItem[];
};

type PurchaseProductsOptions = {
  refresh?: boolean;
  ttl?: number;
  kvCache?: KVNamespace;
};

export async function getPurchaseProducts(
  options: PurchaseProductsOptions = {},
): Promise<PurchaseProducts> {
  const decoration = await getCachedDecoration(
    PURCHASE_PRODUCTS_DECORATION_KEY,
    options,
  );
  const config = parsePurchaseProductsDecoration(decoration);
  const items = await Promise.all(
    config.items.map(async (item) => {
      let product: Product;
      try {
        product = await getCachedProduct(item.slug, options);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to load product.';
        throw new Error(
          `Invalid purchase-products decoration. Product slug "${item.slug}" could not be loaded: ${message}`,
        );
      }

      if (!product.variants.length) {
        throw new Error(
          `Invalid purchase-products decoration. Product slug "${item.slug}" has no active variants.`,
        );
      }

      return {
        key: item.key,
        label: item.label,
        product,
      };
    }),
  );

  return {
    mode: config.mode,
    defaultKey: config.defaultKey,
    items,
  };
}

function parsePurchaseProductsDecoration(decoration: unknown[]) {
  if (!Array.isArray(decoration) || decoration.length === 0) {
    throw new Error(
      'Missing purchase-products decoration. Configure one purchase page item in EMS site decorations.',
    );
  }

  const config = objectValue(decoration[0]) as PurchaseProductsConfig | null;
  if (!config) {
    throw new Error(
      'Invalid purchase-products decoration. First item must be an object.',
    );
  }

  if (config.mode === 'single') {
    const slug = cleanText(
      config.single?.product?.slug ?? config.product?.slug,
    );
    if (!slug) {
      throw new Error(
        'Invalid purchase-products decoration. single.product.slug is required.',
      );
    }

    return {
      mode: 'single' as const,
      defaultKey: 'default',
      items: [
        {
          key: 'default',
          label: 'Product',
          slug,
        },
      ],
    };
  }

  if (config.mode === 'group') {
    const products = Array.isArray(config.group?.products)
      ? config.group.products
      : Array.isArray(config.products)
        ? config.products
        : [];
    if (products.length < 2) {
      throw new Error(
        'Invalid purchase-products decoration. group.products must include at least 2 products.',
      );
    }

    const items = products.map((product, index) => {
      const key = cleanText(product.key);
      const label = cleanText(product.label);
      const slug = cleanText(product.slug);

      if (!key) {
        throw new Error(
          `Invalid purchase-products decoration. group.products[${index}].key is required.`,
        );
      }

      if (!label) {
        throw new Error(
          `Invalid purchase-products decoration. group.products[${index}].label is required.`,
        );
      }

      if (!slug) {
        throw new Error(
          `Invalid purchase-products decoration. group.products[${index}].slug is required.`,
        );
      }

      return { key, label, slug };
    });

    assertUnique(
      items.map((item) => item.key),
      'key',
    );
    assertUnique(
      items.map((item) => item.slug),
      'slug',
    );

    const defaultKey =
      cleanText(config.group?.default ?? config.default) || items[0].key;
    if (!items.some((item) => item.key === defaultKey)) {
      throw new Error(
        `Invalid purchase-products decoration. default "${defaultKey}" does not match a product key.`,
      );
    }

    return {
      mode: 'group' as const,
      defaultKey,
      items,
    };
  }

  throw new Error(
    'Invalid purchase-products decoration. mode must be "single" or "group".',
  );
}

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function assertUnique(values: string[], field: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(
        `Invalid purchase-products decoration. Duplicate product ${field}: ${value}.`,
      );
    }
    seen.add(value);
  }
}
