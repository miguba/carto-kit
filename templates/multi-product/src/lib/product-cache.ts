import { getProduct, type CommerceReadCacheOptions } from "@/lib/commerce";

export const getCachedProduct = async (
  slug: string,
  cacheOptions: CommerceReadCacheOptions = {},
) => getProduct(slug, cacheOptions);
