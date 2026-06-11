import { getCommerceConfig } from './config';
import type { Currency, Product, ProductReview, ProductVariant } from './types';

export type ImageTransformOptions = {
  width?: number;
  quality?: number;
  format?: 'auto' | 'avif' | 'webp' | 'json';
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  blur?: number;
};

export const IMAGE_PRESETS = {
  hero: { width: 1200, quality: 86 },
  card: { width: 480, quality: 82 },
  cardLarge: { width: 720, quality: 84 },
  thumb: { width: 160, quality: 78 },
  tiny: { width: 48, quality: 35, blur: 18 },
  markdown: { width: 960, quality: 84 },
} as const satisfies Record<string, ImageTransformOptions>;

export function formatMoney(amount: number, currency: Currency) {
  const zeroDecimal = currency === 'JPY';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: zeroDecimal ? 0 : 2,
    maximumFractionDigits: zeroDecimal ? 0 : 2,
  }).format(zeroDecimal ? amount : amount / 100);
}

export function formatVariantName(variant: ProductVariant) {
  const optionText = Object.entries(variant.optionValues)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' / ');

  return optionText || variant.sku;
}

export function productTrustSignals(product: Product) {
  const seed = stableHash(product.id || product.slug || product.title);
  const rating = 4.6 + (seed % 4) / 10;
  const sold = Math.max(95, Math.round(product.totalStock * (1.8 + (seed % 9) / 10)));

  return {
    rating: Math.min(4.9, rating).toFixed(1),
    soldText: formatCompactSold(sold),
  };
}

export function productCardPrice(product: Product) {
  const variant = lowestPricedVariant(product);
  const price = variant?.price ?? product.minPrice;
  const compareAtPrice =
    variant?.compareAtPrice && variant.compareAtPrice > price
      ? variant.compareAtPrice
      : null;
  const discountPercent = compareAtPrice
    ? Math.max(1, Math.round(((compareAtPrice - price) / compareAtPrice) * 100))
    : null;

  return {
    compareAtPrice,
    discountPercent,
    price,
    sku: variant?.sku ?? '',
  };
}

export function productImages(product: Product, selectedVariant?: ProductVariant | null) {
  const urls = [
    selectedVariant?.image,
    product.mainImage,
    ...product.galleryImages,
    ...(product.decoration?.pics ?? []),
    ...(product.meta?.decoration?.pics ?? []),
  ]
    .map((url) => (typeof url === 'string' ? normalizeImageUrl(url) : ''))
    .filter(Boolean);

  return Array.from(new Set(urls));
}

export function productVideo(product: Product) {
  return normalizeMediaUrl(product.video ?? product.videoUrl ?? product.video_url ?? product.meta?.video ?? product.meta?.videoUrl ?? product.meta?.video_url ?? '');
}

export function productSellingPoints(product: Product) {
  return product.sellingPoints
    ?? product.selling_points
    ?? product.meta?.sellingPoints
    ?? product.meta?.selling_points
    ?? [];
}

export function productAttributes(product: Product) {
  return product.attributes
    ?? product.specs
    ?? product.meta?.attributes
    ?? product.meta?.specs
    ?? {};
}

export function productReviews(product: Product) {
  const sourceReviews = [
    ...(product.reviews ?? []),
    ...(product.productReviews ?? []),
    ...(product.customerReviews ?? []),
    ...(product.meta?.reviews ?? []),
    ...parseFrontmatterReviews(product.content),
  ];
  const seen = new Set<string>();

  return sourceReviews
    .map(normalizeProductReview)
    .filter((review): review is ProductReview => Boolean(review))
    .filter((review) => {
      const key = review.sourceReviewId || `${review.author ?? ''}:${review.content}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

export function productDescriptionMarkdown(product: Product) {
  const parts = [
    product.description,
    product.descriptionMd,
    product.description_md,
    product.descriptionMarkdown,
    product.description_markdown,
    product.content ? stripFrontmatter(product.content) : "",
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .filter(
      (part, index, allParts) =>
        allParts.findIndex((candidate) => candidate === part) === index,
    );

  return parts.join("\n\n");
}

function normalizeProductReview(review: ProductReview | null | undefined) {
  const content = typeof review?.content === 'string' ? review.content.trim() : '';
  if (!content) {
    return null;
  }

  const normalized: ProductReview = { content };
  const author = cleanOptionalString(review?.author);
  const avatar = cleanOptionalString(review?.avatar);
  const title = cleanOptionalString(review?.title);
  const date = cleanOptionalString(review?.date);
  const purchased = cleanOptionalString(review?.purchased);
  const sourceReviewId = cleanOptionalString(review?.sourceReviewId);
  const rating = typeof review?.rating === 'number' && Number.isFinite(review.rating)
    ? Math.min(5, Math.max(0, review.rating))
    : undefined;
  const helpfulCount = typeof review?.helpfulCount === 'number' && Number.isFinite(review.helpfulCount)
    ? Math.max(0, Math.round(review.helpfulCount))
    : undefined;
  const images = (review?.images ?? [])
    .map((image) => (typeof image === 'string' ? normalizeImageUrl(image) : ''))
    .filter(Boolean);

  if (author) normalized.author = author;
  if (avatar) normalized.avatar = normalizeImageUrl(avatar);
  if (rating !== undefined) normalized.rating = rating;
  if (title) normalized.title = title;
  if (date) normalized.date = date;
  if (purchased) normalized.purchased = purchased;
  if (helpfulCount !== undefined) normalized.helpfulCount = helpfulCount;
  if (images.length) normalized.images = Array.from(new Set(images));
  if (sourceReviewId) normalized.sourceReviewId = sourceReviewId;

  return normalized;
}

function cleanOptionalString(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function parseFrontmatterReviews(content: string | null | undefined) {
  if (!content) {
    return [];
  }

  const frontmatter = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(content)?.[1];
  if (!frontmatter) {
    return [];
  }

  const lines = frontmatter.split(/\r?\n/);
  const reviewsLineIndex = lines.findIndex((line) => /^\s*reviews\s*:/.test(line));
  if (reviewsLineIndex < 0) {
    return [];
  }

  const reviewsLine = lines[reviewsLineIndex];
  const baseIndent = leadingSpaces(reviewsLine);
  const inlineValue = reviewsLine.slice(reviewsLine.indexOf(':') + 1).trim();
  if (inlineValue === '[]') {
    return [];
  }

  const block: string[] = [];
  for (const line of lines.slice(reviewsLineIndex + 1)) {
    if (!line.trim()) {
      block.push(line);
      continue;
    }

    if (leadingSpaces(line) <= baseIndent) {
      break;
    }

    block.push(line);
  }

  return parseReviewBlock(block);
}

function parseReviewBlock(lines: string[]) {
  const reviews: ProductReview[] = [];
  let current: Record<string, unknown> | null = null;
  let itemIndent = 0;
  let listKey = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const indent = leadingSpaces(line);
    if (trimmed.startsWith('- ') && (!current || indent <= itemIndent)) {
      if (current) {
        reviews.push(current as ProductReview);
      }

      current = {};
      itemIndent = indent;
      listKey = '';
      assignYamlPair(current, trimmed.slice(2).trim());
      continue;
    }

    if (!current) {
      continue;
    }

    if (trimmed.startsWith('- ') && listKey) {
      const values = Array.isArray(current[listKey]) ? current[listKey] as unknown[] : [];
      values.push(parseYamlScalar(trimmed.slice(2).trim()));
      current[listKey] = values;
      continue;
    }

    const nextListKey = assignYamlPair(current, trimmed);
    listKey = nextListKey ?? '';
  }

  if (current) {
    reviews.push(current as ProductReview);
  }

  return reviews;
}

function assignYamlPair(target: Record<string, unknown>, line: string) {
  const delimiter = line.indexOf(':');
  if (delimiter < 0) {
    if (!target.content) {
      target.content = parseYamlScalar(line);
    }
    return null;
  }

  const key = line.slice(0, delimiter).trim();
  const value = line.slice(delimiter + 1).trim();
  if (!key) {
    return null;
  }

  if (!value) {
    target[key] = [];
    return key;
  }

  target[key] = parseYamlScalar(value);
  return null;
}

function parseYamlScalar(value: string) {
  const cleaned = value.trim();
  if (!cleaned) {
    return '';
  }
  if (cleaned === '[]') {
    return [];
  }
  if (cleaned === 'true') {
    return true;
  }
  if (cleaned === 'false') {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return Number(cleaned);
  }
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    return cleaned.slice(1, -1);
  }

  return cleaned;
}

function leadingSpaces(value: string) {
  return value.length - value.trimStart().length;
}

export function normalizeImageUrl(value: string) {
  return normalizeMediaUrl(value);
}

export function optimizedImageUrl(value: string, options: ImageTransformOptions = {}) {
  const image = normalizeImageUrl(value);
  if (!image || !canUseCdnImageTransform(image)) {
    return image;
  }

  const transformPath = buildImageTransformPath(options);
  if (!transformPath) {
    return image;
  }

  const { cdnBaseUrl } = getCommerceConfig();
  if (!cdnBaseUrl) {
    return image;
  }

  const sourcePath = stripCdnImageTransform(image).replace(`${cdnBaseUrl}/`, '');
  return `${cdnBaseUrl}/cdn-cgi/image/${transformPath}/${sourcePath.replace(/^\/+/, '')}`;
}

export function imageSrcSet(value: string, widths: number[], options: Omit<ImageTransformOptions, 'width'> = {}) {
  return widths
    .map((width) => `${optimizedImageUrl(value, { ...options, width })} ${width}w`)
    .join(', ');
}

export function imagePlaceholderStyle(value: string) {
  const placeholder = optimizedImageUrl(value, IMAGE_PRESETS.tiny);
  return placeholder ? `--image-placeholder: url("${placeholder}")` : undefined;
}

export function normalizeMediaUrl(value: string) {
  if (!value) {
    return '';
  }

  const image = value.trim();
  if (!image) {
    return '';
  }

  if (/^(https?:|data:|\/)/.test(image)) {
    return image;
  }

  const { cdnBaseUrl } = getCommerceConfig();
  if (!cdnBaseUrl) {
    return image;
  }

  return `${cdnBaseUrl}/${image.replace(/^\/+/, '')}`;
}

function canUseCdnImageTransform(value: string) {
  if (value.startsWith('data:') || value.startsWith('/')) {
    return false;
  }

  const { cdnBaseUrl } = getCommerceConfig();
  if (!cdnBaseUrl) {
    return false;
  }

  return value === cdnBaseUrl || value.startsWith(`${cdnBaseUrl}/`);
}

function stripCdnImageTransform(value: string) {
  return value.replace(/\/cdn-cgi\/image\/[^/]+\//, '/');
}

function buildImageTransformPath(options: ImageTransformOptions) {
  const parts = [
    options.width ? `width=${Math.max(1, Math.round(options.width))}` : '',
    options.quality ? `quality=${Math.min(100, Math.max(1, Math.round(options.quality)))}` : '',
    `format=${options.format ?? 'auto'}`,
    options.fit ? `fit=${options.fit}` : '',
    options.blur ? `blur=${Math.min(250, Math.max(1, Math.round(options.blur)))}` : '',
  ].filter(Boolean);

  return parts.join(',');
}

function stableHash(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function formatCompactSold(value: number) {
  if (value >= 1000) {
    const compact = value / 1000;
    return `${compact >= 10 ? Math.round(compact) : compact.toFixed(1).replace(/\.0$/, '')}K+ sold`;
  }

  return `${value}+ sold`;
}

function lowestPricedVariant(product: Product) {
  const availableVariants = product.variants.filter(
    (variant) => variant.status === 'active' && variant.stock > 0,
  );
  const variants = availableVariants.length ? availableVariants : product.variants;

  return variants.reduce<ProductVariant | null>(
    (lowest, variant) => (!lowest || variant.price < lowest.price ? variant : lowest),
    null,
  );
}

export function optionGroups(product: Product) {
  const groups = new Map<string, Set<string>>();

  for (const variant of product.variants) {
    for (const [name, value] of Object.entries(variant.optionValues)) {
      if (!groups.has(name)) {
        groups.set(name, new Set());
      }
      groups.get(name)?.add(value);
    }
  }

  return Array.from(groups.entries()).map(([name, values]) => ({
    name,
    values: Array.from(values),
  }));
}

export function stripFrontmatter(value: string) {
  const normalized = value.replace(/^\uFEFF/, '');
  const match = normalized.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/);

  return (match ? normalized.slice(match[0].length) : normalized).trim();
}
