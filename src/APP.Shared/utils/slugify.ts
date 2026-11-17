/**
 * Converts a display name (e.g. university name) into a URL/filename-safe slug.
 * Used to build stable Cloudinary publicIds for logo/cover (same rules as Img_Up).
 *
 * Examples:
 *   "University of Oxford"       -> "university-of-oxford"
 *   "École Polytechnique"        -> "ecole-polytechnique"
 *   "St. Andrews (Scotland)"     -> "st-andrews-scotland"
 *   "  Multiple   Spaces  "      -> "multiple-spaces"
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
