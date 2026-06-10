import { cachePage } from '@/lib/cache-page';
import { getProduct } from '@/lib/commerce';
import type { Product } from '@/lib/types';

type ProductCacheOptions = {
  refresh?: boolean;
  ttl?: number;
  kvCache?: KVNamespace;
};

export const getCachedProduct = async (
  slug: string,
  { refresh = false, ttl, kvCache }: ProductCacheOptions = {},
) => {
  const { data } = await cachePage<Product>(`product:${slug}`, {
    async fun() {
      return getProduct(slug);
    },
    refresh,
    ttl,
    kvCache,
  });

  return data;
};
