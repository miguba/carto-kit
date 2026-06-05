import type { Money, Product, ProductImage, ProductVariant } from "./types";

export function getProductImages(product: Product): ProductImage[] {
  const raw = [
    product.mainImage,
    ...(product.gallery ?? []),
    ...(product.images ?? [])
  ].filter(Boolean);

  const seen = new Set<string>();
  return raw.flatMap((image) => {
    const normalized = typeof image === "string" ? { url: image } : image;
    if (!normalized?.url || seen.has(normalized.url)) return [];
    seen.add(normalized.url);
    return [normalized];
  });
}

export function getProductPrice(product: Product, variant?: ProductVariant): string {
  const price = variant?.price ?? product.price;
  const currency = getCurrency(price, product.currency);
  const amount = typeof price === "number" ? price : price?.amount;
  if (typeof amount !== "number") return "Price unavailable";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency
  }).format(amount / 100);
}

export function getInventoryLabel(product: Product): string {
  const inventory = product.inventory;
  if (typeof inventory !== "number") return "In stock";
  if (inventory <= 0) return "Out of stock";
  if (inventory <= 5) return `${inventory} left`;
  return "In stock";
}

function getCurrency(price: Money | number | undefined, fallback?: string): string {
  if (typeof price === "object" && price?.currency) return price.currency;
  return fallback || "USD";
}
