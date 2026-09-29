/** Constants for the skills module. */

/** Initial body version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Import size cap (`.md`/`.zip`) — rejects oversized archives before parsing. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Cap on the *inflated* size of the one `.md` read from a `.zip` — the
 *  archive cap alone doesn't bound what a zip bomb expands to. */
export const MAX_UNZIPPED_SKILL_BYTES = 2 * 1024 * 1024;

/** Default description used when an imported file has no frontmatter `description`. */
export const DEFAULT_IMPORTED_SKILL_DESCRIPTION = 'Imported skill — edit this description.';

/** Default skill type when an imported file has no frontmatter `type` (or an unknown one). */
export const DEFAULT_IMPORTED_SKILL_TYPE = 'custom' as const;

/** URL import: whole-request timeout and how many redirects to follow (each re-vetted). */
export const URL_IMPORT_TIMEOUT_MS = 10_000;
export const URL_IMPORT_MAX_REDIRECTS = 3;

/**
 * Content types accepted from a skill URL — markdown/plain text or a zip. An
 * HTML page (e.g. a GitHub file *view* instead of its raw link) is refused
 * with a hint rather than imported as a "skill" full of page markup.
 */
export const URL_IMPORT_CONTENT_TYPES = [
  'text/markdown',
  'text/x-markdown',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
] as const;
