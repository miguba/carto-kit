import { getBlocksByKeys } from './commerce';
import {
  extractMarkdownHeadings,
  markdownToPlainText,
  parseMarkdownFrontmatter,
  renderMarkdown,
} from './markdown';

type LoadPolicyBlockOptions = {
  key: string;
  defaultMarkdown: string;
  fallbackTitle: string;
  fallbackIntro: string;
  fallbackDescription: string;
  siteName: string;
  variables?: Record<string, string>;
};

type ContactMethod = {
  label: string;
  value: string;
  href?: string;
};

export async function loadPolicyBlock({
  key,
  defaultMarkdown,
  fallbackTitle,
  fallbackIntro,
  fallbackDescription,
  siteName,
  variables = {},
}: LoadPolicyBlockOptions) {
  const blocks = await getBlocksByKeys([key]);
  const block = blocks[key];
  const markdown = block?.content ?? defaultMarkdown;
  const parsed = parseMarkdownFrontmatter(markdown);
  const meta = {
    ...parsed.meta,
    ...(block?.meta ?? {}),
  };
  const title = getMetaString(meta, 'title', variables) ?? fallbackTitle;
  const seoTitle =
    getNestedMetaString(meta, ['seo', 'title'], variables) ??
    getMetaString(meta, 'seoTitle', variables) ??
    title;
  const intro = getMetaString(meta, 'intro', variables) ?? fallbackIntro;
  const updated =
    getMetaString(meta, 'updated', variables) ??
    (block?.updatedAt ? formatDate(block.updatedAt) : undefined);
  const bodyText = markdownToPlainText(parsed.body);
  const pageDescription =
    getNestedMetaString(meta, ['seo', 'description'], variables) ??
    getMetaString(meta, 'seoDescription', variables) ??
    (bodyText.slice(0, 155) || fallbackDescription || `${title} | ${siteName}`);

  return {
    eyebrow: getMetaString(meta, 'eyebrow', variables) ?? 'Policy',
    title,
    seoTitle,
    intro,
    updated,
    pageDescription,
    asideTitle:
      getNestedMetaString(meta, ['aside', 'title'], variables) ??
      getMetaString(meta, 'asideTitle', variables) ??
      'Need a hand?',
    asideText:
      getNestedMetaString(meta, ['aside', 'text'], variables) ??
      getMetaString(meta, 'asideText', variables) ??
      'Our support team can help with order questions, policy details, and checkout assistance.',
    contactMethods: normalizeContactMethods(meta.contactMethods, variables),
    contentHeadings: extractMarkdownHeadings(parsed.body),
    contentHtml: renderMarkdown(parsed.body, { headingIds: true }),
  };
}

function getMetaString(
  meta: Record<string, unknown>,
  key: string,
  variables: Record<string, string>,
) {
  const value = meta[key];
  return typeof value === 'string' && value.trim()
    ? interpolateText(value.trim(), variables)
    : undefined;
}

function getNestedMetaString(
  meta: Record<string, unknown>,
  path: string[],
  variables: Record<string, string>,
) {
  const value = path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, meta);

  return typeof value === 'string' && value.trim()
    ? interpolateText(value.trim(), variables)
    : undefined;
}

function normalizeContactMethods(
  value: unknown,
  variables: Record<string, string>,
): ContactMethod[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const label = cleanString(record.label, variables);
      const contactValue = cleanString(record.value, variables);
      const href = cleanString(record.href, variables);

      if (!label || !contactValue) {
        return null;
      }

      return {
        label,
        value: contactValue,
        ...(href ? { href } : {}),
      };
    })
    .filter((item): item is ContactMethod => Boolean(item));
}

function cleanString(value: unknown, variables: Record<string, string>) {
  return typeof value === 'string' && value.trim()
    ? interpolateText(value.trim(), variables)
    : undefined;
}

function interpolateText(value: string, variables: Record<string, string>) {
  return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (match, key) => {
    return variables[key] ?? match;
  });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}
