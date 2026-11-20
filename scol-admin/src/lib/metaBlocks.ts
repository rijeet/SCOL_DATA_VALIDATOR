/** CRM metadata block. Mirrors @shared/validation/metaDataItems. */

export type MetaBlock = {
  subtitle: string;
  description: string[];
};

export function blankMetaBlock(): MetaBlock {
  return { subtitle: '', description: [''] };
}

export function cleanMetaBlocks(blocks: MetaBlock[]): MetaBlock[] {
  return blocks
    .map((block) => ({
      subtitle: (block.subtitle ?? '').trim(),
      description: (block.description ?? [])
        .map((line) => String(line).trim())
        .filter(Boolean),
    }))
    .filter((block) => block.subtitle || block.description.length);
}

/** Pretty JSON, or "" when every block is empty. */
export function serializeMetaBlocks(blocks: MetaBlock[]): string {
  const cleaned = cleanMetaBlocks(blocks);
  if (!cleaned.length) return '';
  return JSON.stringify(cleaned, null, 2);
}

export type ParsedMetaBlocks =
  | { ok: true; blocks: MetaBlock[] }
  | { ok: false; error: string };

function normalizeBlock(value: unknown): MetaBlock | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (row.subtitle !== undefined && typeof row.subtitle !== 'string') {
    return null;
  }
  const subtitle = typeof row.subtitle === 'string' ? row.subtitle : '';
  if (typeof row.description === 'string') {
    return { subtitle, description: [row.description] };
  }
  if (
    Array.isArray(row.description) &&
    row.description.every((item) => typeof item === 'string')
  ) {
    return { subtitle, description: [...row.description] };
  }
  return null;
}

/** Load stored metadata. A string description becomes one paragraph. */
export function parseMetaBlocks(raw: string): ParsedMetaBlocks {
  const text = raw.trim();
  if (!text) return { ok: true, blocks: [] };
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) {
      return { ok: false, error: 'Must be a JSON array' };
    }
    const blocks: MetaBlock[] = [];
    for (const value of parsed) {
      const block = normalizeBlock(value);
      if (!block) {
        return {
          ok: false,
          error: 'Each item needs a subtitle and a description list',
        };
      }
      blocks.push(block);
    }
    return { ok: true, blocks };
  } catch (err) {
    if (err instanceof SyntaxError) return { ok: false, error: err.message };
    return { ok: false, error: 'Could not parse JSON' };
  }
}

export function metaFieldError(raw: string): string | null {
  const parsed = parseMetaBlocks(raw);
  return parsed.ok ? null : parsed.error;
}
