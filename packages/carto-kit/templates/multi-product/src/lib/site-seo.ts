import { getBlocksByKeys } from "./commerce";
import { parseMarkdownFrontmatter } from "./markdown";

const HOME_SEO_BLOCK_KEY = "home-seo";

export async function getHomeSeo(defaultMarkdown: string, siteName: string) {
  const blocks = await getBlocksByKeys([HOME_SEO_BLOCK_KEY]);
  const block = blocks[HOME_SEO_BLOCK_KEY];
  const parsed = parseMarkdownFrontmatter(block?.content ?? defaultMarkdown);
  const meta = {
    ...parsed.meta,
    ...(block?.meta ?? {}),
  };

  return {
    title:
      firstString(meta.homeSeoTitle, meta.seoTitle, meta.title) ??
      `${siteName} | Genuine Products, Instant Joy`,
    description:
      firstString(meta.homeSeoDescription, meta.seoDescription, meta.description) ??
      `${siteName} — Handpicked products at unbeatable prices. Genuine quality, fast delivery, and a checkout experience that sparks joy.`,
  };
}

function firstString(...values: unknown[]) {
  return values.find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  )?.trim();
}
