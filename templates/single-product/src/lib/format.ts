import { getCommerceConfig } from './config';
import type { Currency, Product, ProductVariant } from './types';

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

export function extractProductContentImages(value: string) {
  const source = stripFrontmatter(value);
  const urls = [
    ...Array.from(source.matchAll(/!\[[^\]]*]\(([^)]+)\)/g), (match) => match[1] ?? ''),
    ...Array.from(source.matchAll(/<img\b[^>]*\bsrc=(["']?)([^"'\s>]+)\1[^>]*>/gi), (match) => match[2] ?? ''),
  ]
    .map((url) => normalizeImageUrl(decodeHtmlAttribute(url)))
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
        html.push(`<img src="${escapeHtml(src)}" alt="${escapeHtml(imageMatch[1] || 'Product detail image')}" loading="lazy" />`);
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
