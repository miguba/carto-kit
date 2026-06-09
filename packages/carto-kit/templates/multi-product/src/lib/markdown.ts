import {
  IMAGE_PRESETS,
  imagePlaceholderStyle,
  optimizedImageUrl,
} from "./format";

type RenderMarkdownOptions = {
  headingOffset?: number;
  headingIds?: boolean;
};

export function renderMarkdown(markdown: string, options: RenderMarkdownOptions = {}) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = Math.min(
        heading[1].length + (options.headingOffset ?? 0),
        6,
      );
      const idAttribute = options.headingIds
        ? ` id="${escapeAttribute(slugify(heading[2]))}"`
        : "";
      blocks.push(
        `<h${level}${idAttribute}>${renderInlineMarkdown(heading[2])}</h${level}>`,
      );
      index += 1;
      continue;
    }

    const unorderedItems: string[] = [];
    while (index < lines.length) {
      const item = /^\s*[-*+]\s+(.+)$/.exec(lines[index]);
      if (!item) break;
      unorderedItems.push(`<li>${renderInlineMarkdown(item[1])}</li>`);
      index += 1;
    }
    if (unorderedItems.length) {
      blocks.push(`<ul>${unorderedItems.join("")}</ul>`);
      continue;
    }

    const orderedItems: string[] = [];
    while (index < lines.length) {
      const item = /^\s*\d+[.)]\s+(.+)$/.exec(lines[index]);
      if (!item) break;
      orderedItems.push(`<li>${renderInlineMarkdown(item[1])}</li>`);
      index += 1;
    }
    if (orderedItems.length) {
      blocks.push(`<ol>${orderedItems.join("")}</ol>`);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
  }

  return blocks.join("\n");
}

export function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[`*_#>~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripMarkdownFrontmatter(markdown: string) {
  return parseMarkdownFrontmatter(markdown).body;
}

export function parseMarkdownFrontmatter(markdown: string) {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(markdown);
  if (!match) {
    return {
      meta: {} as Record<string, string>,
      body: markdown.trim(),
    };
  }

  const meta = Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map((line) => {
        const delimiter = line.indexOf(":");
        if (delimiter < 0) return null;
        const key = line.slice(0, delimiter).trim();
        const value = line.slice(delimiter + 1).trim();
        return key ? [key, value] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry)),
  );

  return {
    meta,
    body: markdown.slice(match[0].length).trim(),
  };
}

export function extractMarkdownHeadings(markdown: string, level = 2) {
  const marker = "#".repeat(level);

  return markdown
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "")
    .split(/\r?\n/)
    .map((line) => new RegExp(`^${marker}\\s+(.+)$`).exec(line)?.[1]?.trim())
    .filter((heading): heading is string => Boolean(heading));
}

function renderInlineMarkdown(text: string) {
  const pattern =
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let cursor = 0;
  let html = "";

  for (const match of text.matchAll(pattern)) {
    html += escapeHtml(text.slice(cursor, match.index));

    if (match[1] !== undefined) {
      const alt = match[1];
      const src = match[2];
      if (isSafeImageUrl(src)) {
        const imageUrl = optimizedImageUrl(src, IMAGE_PRESETS.markdown);
        const placeholder = imagePlaceholderStyle(src);
        const placeholderAttribute = placeholder
          ? ` style="${escapeAttribute(placeholder)}"`
          : "";
        html += `<span class="markdown-image-frame image-placeholder-frame"${placeholderAttribute}><img src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(alt)}" width="960" height="960" loading="lazy" decoding="async" fetchpriority="low"></span>`;
      } else {
        html += escapeHtml(alt);
      }
    } else if (match[3] !== undefined) {
      const label = match[3];
      const href = match[4];
      html += isSafeLinkUrl(href)
        ? `<a href="${escapeAttribute(href)}">${escapeHtml(label)}</a>`
        : escapeHtml(label);
    } else if (match[5] !== undefined) {
      html += `<code>${escapeHtml(match[5])}</code>`;
    } else if (match[6] !== undefined) {
      html += `<strong>${escapeHtml(match[6])}</strong>`;
    } else if (match[7] !== undefined) {
      html += `<em>${escapeHtml(match[7])}</em>`;
    }

    cursor = match.index + match[0].length;
  }

  return html + escapeHtml(text.slice(cursor));
}

function isSafeImageUrl(url: string) {
  const value = url.trim();
  if (/^(https?:\/\/|\/(?!\/)|\.{1,2}\/)/i.test(value)) {
    return true;
  }

  return (
    !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
    !value.startsWith("//") &&
    value !== "#"
  );
}

function isSafeLinkUrl(url: string) {
  return /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(url);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
