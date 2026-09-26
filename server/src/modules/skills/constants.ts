/** Constants for the skills module. */

/** Initial body version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Import size cap (`.md`/`.zip`) — rejects oversized archives before parsing. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Default description used when an imported file has no frontmatter `description`. */
export const DEFAULT_IMPORTED_SKILL_DESCRIPTION = 'Imported skill — edit this description.';

/** Default skill type when an imported file has no frontmatter `type` (or an unknown one). */
export const DEFAULT_IMPORTED_SKILL_TYPE = 'custom' as const;
