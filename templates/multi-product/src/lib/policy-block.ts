import {
  getBlocksByKeys,
  type CommerceReadCacheOptions,
} from "./commerce";
import {
  extractMarkdownHeadings,
  markdownToPlainText,
  parseMarkdownFrontmatter,
  renderMarkdown,
} from "./markdown";

type LoadPolicyBlockOptions = {
  key: string;
  defaultMarkdown: string;
  fallbackTitle: string;
  fallbackIntro: string;
  fallbackDescription: string;
  siteName: string;
} & CommerceReadCacheOptions;

export async function loadPolicyBlock({
  key,
  defaultMarkdown,
  fallbackTitle,
  fallbackIntro,
  fallbackDescription,
  siteName,
  refresh,
  ttl,
  kvCache,
}: LoadPolicyBlockOptions) {
  const blocks = await getBlocksByKeys([key], { refresh, ttl, kvCache });
  const block = blocks[key];
  const markdown = block?.content ?? defaultMarkdown;
  const parsed = parseMarkdownFrontmatter(markdown);
  const meta = {
    ...parsed.meta,
    ...(block?.meta ?? {}),
  };
  const title = getMetaString(meta, "title") ?? fallbackTitle;
  const seoTitle = getMetaString(meta, "seoTitle") ?? title;
  const intro = getMetaString(meta, "intro") ?? fallbackIntro;
  const updated =
    getMetaString(meta, "updated") ??
    (block?.updatedAt ? formatDate(block.updatedAt) : undefined);
  const bodyText = markdownToPlainText(parsed.body);
  const pageDescription =
    getMetaString(meta, "seoDescription") ??
    (bodyText.slice(0, 155) || fallbackDescription || `${title} | ${siteName}`);

  return {
    eyebrow: getMetaString(meta, "eyebrow") ?? "Policy",
    title,
    seoTitle,
    intro,
    updated,
    pageDescription,
    asideTitle: getMetaString(meta, "asideTitle") ?? "Need a hand?",
    asideText:
      getMetaString(meta, "asideText") ??
      "Our support team can help with order questions, policy details, and checkout assistance.",
    contentHeadings: extractMarkdownHeadings(parsed.body),
    contentHtml: renderMarkdown(parsed.body, { headingIds: true }),
  };
}

function getMetaString(meta: Record<string, unknown>, key: string) {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
