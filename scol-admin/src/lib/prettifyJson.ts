export const META_JSON_FIELD_KEYS = [
  'AcademicRequirementsMetaData',
  'feesMetaData',
  'scholarshipMetaData',
] as const;

export function isValidJson(raw: string): boolean {
  return getJsonParseError(raw) === null;
}

/** Browser JSON.parse message, e.g. "Unexpected token } in JSON at position 42". */
export function getJsonParseError(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    JSON.parse(trimmed);
    return null;
  } catch (err) {
    if (err instanceof SyntaxError) {
      return err.message;
    }
    return 'Could not parse JSON';
  }
}

/** Pretty-print JSON for display; returns original text if not valid JSON. */
export function prettifyJson(raw: string, indent = 2): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed, null, indent);
  } catch {
    return raw;
  }
}

export function prettifyMetaFields(
  fields: Record<string, string>,
): Record<string, string> {
  const next = { ...fields };
  for (const key of META_JSON_FIELD_KEYS) {
    if (next[key]?.trim()) {
      next[key] = prettifyJson(next[key]);
    }
  }
  return next;
}
