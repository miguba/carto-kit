import { getCommerceConfig } from './config';
import type { Currency, Product, ProductVariant } from './types';

export type ImageTransformOptions = {
  width?: number;
  quality?: number;
  format?: 'auto' | 'avif' | 'webp' | 'json';
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  blur?: number;
};

export const IMAGE_PRESETS = {
  hero: { width: 1200, quality: 86 },
  detail: { width: 960, quality: 84 },
  card: { width: 480, quality: 82 },
  thumb: { width: 160, quality: 78 },
  tiny: { width: 48, quality: 35, blur: 18 },
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

export function productImages(
  product: Product,
  selectedVariant?: ProductVariant | null,
  cdnBaseUrl?: string,
) {
  const urls = [
    selectedVariant?.image,
    product.mainImage,
    ...product.galleryImages,
    ...(product.meta?.decoration?.pics ?? []),
    ...(product.decoration?.pics ?? []),
  ]
    .map((url) =>
      typeof url === 'string' ? normalizeImageUrl(url, cdnBaseUrl) : '',
    )
    .filter(Boolean);

  return Array.from(new Set(urls));
}

export function productVideo(product: Product, cdnBaseUrl?: string) {
  return normalizeMediaUrl(
    product.video ??
      product.videoUrl ??
      product.video_url ??
      product.meta?.video ??
      product.meta?.videoUrl ??
      product.meta?.video_url ??
      '',
    cdnBaseUrl,
  );
}

export function normalizeImageUrl(value: string, cdnBaseUrl?: string) {
  return normalizeMediaUrl(value, cdnBaseUrl);
}

export function optimizedImageUrl(
  value: string,
  options: ImageTransformOptions = {},
  cdnBaseUrl?: string,
) {
  const image = normalizeImageUrl(value, cdnBaseUrl);
  if (!image || !canUseCdnImageTransform(image, cdnBaseUrl)) {
    return image;
  }

  const transformPath = buildImageTransformPath(options);
  if (!transformPath) {
    return image;
  }

  const mediaBaseUrl = cdnBaseUrl ?? getCommerceConfig().cdnBaseUrl;
  if (!mediaBaseUrl) {
    return image;
  }

  const sourcePath = stripCdnImageTransform(image).replace(
    `${mediaBaseUrl}/`,
    '',
  );
  return `${mediaBaseUrl}/cdn-cgi/image/${transformPath}/${sourcePath.replace(/^\/+/, '')}`;
}

export function imageSrcSet(
  value: string,
  widths: number[],
  options: Omit<ImageTransformOptions, 'width'> = {},
  cdnBaseUrl?: string,
) {
  return widths
    .map(
      (width) =>
        `${optimizedImageUrl(value, { ...options, width }, cdnBaseUrl)} ${width}w`,
    )
    .join(', ');
}

export function imagePlaceholderStyle(value: string, cdnBaseUrl?: string) {
  const placeholder = optimizedImageUrl(value, IMAGE_PRESETS.tiny, cdnBaseUrl);
  return placeholder ? `--image-placeholder: url("${placeholder}")` : undefined;
}

export function extractProductContentImages(value: string, cdnBaseUrl?: string) {
  const source = stripFrontmatter(value);
  const urls = [
    ...Array.from(source.matchAll(/!\[[^\]]*]\(([^)]+)\)/g), (match) => match[1] ?? ''),
    ...Array.from(source.matchAll(/<img\b[^>]*\bsrc=(["']?)([^"'\s>]+)\1[^>]*>/gi), (match) => match[2] ?? ''),
  ]
    .map((url) => normalizeImageUrl(decodeHtmlAttribute(url), cdnBaseUrl))
    .filter(Boolean);

  return Array.from(new Set(urls));
}

export function removeProductContentImages(value: string) {
  return stripFrontmatter(value)
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeMediaUrl(value: string, cdnBaseUrl?: string) {
  const image = value.trim();
  if (!image) {
    return '';
  }

  if (/^(https?:|data:|\/)/.test(image)) {
    return image;
  }

  const mediaBaseUrl = cdnBaseUrl ?? getCommerceConfig().cdnBaseUrl;
  if (!mediaBaseUrl) {
    return image;
  }

  return `${mediaBaseUrl}/${image.replace(/^\/+/, '')}`;
}

function canUseCdnImageTransform(value: string, cdnBaseUrl?: string) {
  if (value.startsWith('data:') || value.startsWith('/')) {
    return false;
  }

  const mediaBaseUrl = cdnBaseUrl ?? getCommerceConfig().cdnBaseUrl;
  if (!mediaBaseUrl) {
    return false;
  }

  return value === mediaBaseUrl || value.startsWith(`${mediaBaseUrl}/`);
}

function stripCdnImageTransform(value: string) {
  return value.replace(/\/cdn-cgi\/image\/[^/]+\//, '/');
}

function buildImageTransformPath(options: ImageTransformOptions) {
  const parts = [
    options.width ? `width=${Math.max(1, Math.round(options.width))}` : '',
    options.quality
      ? `quality=${Math.min(100, Math.max(1, Math.round(options.quality)))}`
      : '',
    `format=${options.format ?? 'auto'}`,
    options.fit ? `fit=${options.fit}` : '',
    options.blur ? `blur=${Math.min(250, Math.max(1, Math.round(options.blur)))}` : '',
  ].filter(Boolean);

  return parts.join(',');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function renderInlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

export function renderProductMarkdownHtml(value: string) {
  const lines = stripFrontmatter(value).split(/\r?\n/);
  const html: string[] = [];
  let paragraph: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }

    html.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listType || !listItems.length) {
      return;
    }

    html.push(`<${listType}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</${listType}>`);
    listType = null;
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)]\(([^)]+)\)$/);
    if (imageMatch) {
      flushParagraph();
      flushList();

      const src = normalizeImageUrl(imageMatch[2] ?? '');
      if (src) {
        const imageUrl = optimizedImageUrl(src, IMAGE_PRESETS.detail);
        const placeholder = imagePlaceholderStyle(src);
        const placeholderAttribute = placeholder
          ? ` style="${escapeHtml(placeholder)}"`
          : '';
        html.push(`<span class="markdown-image-frame image-placeholder-frame"${placeholderAttribute}><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(imageMatch[1] || 'Product detail image')}" width="960" height="960" loading="lazy" decoding="async" fetchpriority="low" /></span>`);
      }
      continue;
    }

    const headingMatch = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();

      const level = headingMatch[1].length === 2 ? 3 : headingMatch[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);
    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      flushParagraph();

      const nextType = unorderedMatch ? 'ul' : 'ol';
      if (listType && listType !== nextType) {
        flushList();
      }

      listType = nextType;
      listItems.push((unorderedMatch?.[1] ?? orderedMatch?.[1] ?? '').trim());
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();

  return html.join('\n');
}

export function stripFrontmatter(value: string) {
  return value.replace(/^---[\s\S]*?---\s*/m, '').trim();
}
