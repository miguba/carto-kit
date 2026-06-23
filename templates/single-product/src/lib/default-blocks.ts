import type { CommerceBlock } from './commerce';
import { parseMarkdownFrontmatter } from './markdown';

/**
 * Default block content files, keyed by block key.
 * Each .md file uses YAML frontmatter for meta and the body as content,
 * following the same pattern as policy block defaults.
 * Remote CMS blocks are merged over matching local files so templates can
 * ship defaults while CMS authors only override the fields they need.
 */
const DEFAULT_BLOCK_FILES: Record<string, string> = {
  'purchase-products': 'purchase-products',
  'home-content': 'home-content',
  'footer-content': 'footer-content',
};

const blockCache = new Map<string, CommerceBlock | null>();

function loadBlockFile(filename: string): CommerceBlock | null {
  try {
    const modules = import.meta.glob<string>('../content/blocks/*.md', {
      eager: true,
      query: '?raw',
      import: 'default',
    });
    const modulePath = `../content/blocks/${filename}.md`;
    const raw = modules[modulePath];
    if (!raw) {
      return null;
    }

    const parsed = parseMarkdownFrontmatter(raw);
    const meta = parsed.meta;
    const key = (typeof meta.blockKey === 'string' && meta.blockKey) || filename;
    const type = (typeof meta.type === 'string' && meta.type) || '';

    // Remove internal-only fields from meta before exposing as block meta
    const { blockKey: _blockKey, type: _type, ...blockMeta } = meta;

    return {
      key,
      type,
      meta: blockMeta,
      content: parsed.body,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Returns a default CommerceBlock for the given key by reading
 * the matching .md file under `src/content/blocks/`.
 * Returns `undefined` if no default file exists for the key.
 */
export function getDefaultBlock(key: string): CommerceBlock | undefined {
  if (blockCache.has(key)) {
    return blockCache.get(key) ?? undefined;
  }

  const filename = DEFAULT_BLOCK_FILES[key];
  if (!filename) {
    blockCache.set(key, null);
    return undefined;
  }

  const block = loadBlockFile(filename);
  blockCache.set(key, block);
  return block ?? undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasValue(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

function mergeMetaDefaults(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...defaults };

  for (const [key, value] of Object.entries(overrides)) {
    const defaultValue = defaults[key];

    if (!hasValue(value)) {
      continue;
    }

    if (isRecord(defaultValue) && isRecord(value)) {
      merged[key] = mergeMetaDefaults(defaultValue, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

function mergeBlockDefaults(
  defaultBlock: CommerceBlock,
  block: CommerceBlock,
): CommerceBlock {
  const content = block.content.trim() ? block.content : defaultBlock.content;

  return {
    ...defaultBlock,
    ...block,
    type: block.type || defaultBlock.type,
    meta: mergeMetaDefaults(defaultBlock.meta, block.meta),
    content,
  };
}

/**
 * For a set of requested keys, merges remote CMS blocks over matching local
 * defaults. Remote blocks take priority, but missing nested meta fields and
 * empty content can still be supplied by the local default block file.
 */
export function fillDefaultBlocks(
  blocks: Record<string, CommerceBlock>,
  requestedKeys: string[],
): Record<string, CommerceBlock> {
  const result = { ...blocks };
  for (const key of requestedKeys) {
    const defaultBlock = getDefaultBlock(key);
    if (!defaultBlock) {
      continue;
    }

    if (result[key]) {
      result[key] = mergeBlockDefaults(defaultBlock, result[key]);
    } else {
      result[key] = defaultBlock;
    }
  }

  return result;
}
