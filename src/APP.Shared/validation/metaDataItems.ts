import type { MetaDataItem } from '../types/MetaDataItem.type';

function normalizeMetaDataItem(value: unknown): MetaDataItem | null {
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
    return { subtitle, description: row.description };
  }
  return null;
}

/**
 * Parse MetaDataItem JSON. A string `description` is one paragraph and is
 * returned as a one-item array so older rows publish in the CRM shape.
 * Empty text returns null.
 */
export function parseMetaDataItems(raw: string): MetaDataItem[] | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return null;
    const items: MetaDataItem[] = [];
    for (const value of parsed) {
      const item = normalizeMetaDataItem(value);
      if (!item) return null;
      items.push(item);
    }
    return items;
  } catch {
    return null;
  }
}

/** Shape check for ranking metadata. Missing text is handled by the required-field check. */
export function rankingMetaError(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'Must be valid JSON';
  }
  if (!Array.isArray(parsed)) return 'Must be a JSON array';
  if (parsed.length === 0) return 'Must be a non-empty JSON array';
  if (!parseMetaDataItems(text)) {
    return 'Each item needs a subtitle and a description list';
  }
  return null;
}
