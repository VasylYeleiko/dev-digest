/**
 * conventions — literals (ring 1). Sampling budget, evidence-gate thresholds
 * and the model-call knobs live here so the pipeline has no magic numbers.
 */

/** Top-ranked source files sampled via `repoIntel.getConventionSamples()`. */
export const SAMPLE_SOURCE_FILES = 12;

/**
 * How many ranked paths to request before spreading the 12 slots across
 * packages. Paths only (no file reads), so it can cover a whole repo — a
 * short pool can miss a package entirely when ranks tie.
 */
export const SAMPLE_POOL_FILES = 2_000;

/** Package roots probed for config files: the repo root + this many packages. */
export const MAX_PACKAGE_ROOTS = 4;

/** Monorepo container dirs whose children are the packages (`packages/ui`). */
export const PACKAGE_CONTAINER_DIRS = ['packages', 'apps', 'libs', 'services'] as const;

/** Config files kept after probing (the rest of the budget goes to source). */
export const MAX_CONFIG_FILES = 10;

/**
 * Config files probed at every package root, highest signal first. Read by
 * exact path — a missing file costs one `null` read, no directory walk.
 */
export const CONFIG_FILE_NAMES = [
  'tsconfig.json',
  'tsconfig.base.json',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'biome.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  'prettier.config.js',
  'prettier.config.mjs',
  '.editorconfig',
  'package.json',
] as const;

/** Per-file cap on what the model sees (lines, then characters). */
export const MAX_LINES_PER_FILE = 250;
export const MAX_CHARS_PER_FILE = 12_000;

/** Evidence gate: a snippet must carry at least this much non-whitespace code… */
export const MIN_SNIPPET_CHARS = 12;
/** …and is trimmed to this many lines before matching (UI shows the same slice). */
export const MAX_SNIPPET_LINES = 12;

/** How many conventions the prompt asks for (strongest first). */
export const MAX_CONVENTIONS_REQUESTED = 15;

/** Hard cap on candidates taken from one model reply, whatever the prompt said. */
export const MAX_CANDIDATES = 25;

/** Same limit the PATCH contract puts on an edited rule. */
export const MAX_RULE_CHARS = 500;

/** Model-call knobs for the single PROPOSE call. */
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';
export const EXTRACTION_TEMPERATURE = 0.2;
export const EXTRACTION_MAX_RETRIES = 1;
export const EXTRACTION_TIMEOUT_MS = 180_000;

/** System-prompt template under `src/prompts/`. */
export const SYSTEM_PROMPT_TEMPLATE = 'conventions.system.md';

/** Default name of the skill merged from accepted conventions (criterion: `repo-conventions`). */
export const DEFAULT_SKILL_NAME = 'repo-conventions';

/** Section headings of the merged skill body, in the order they appear. */
export const CATEGORY_TITLES = {
  naming: 'Naming',
  structure: 'Structure',
  imports: 'Imports',
  types: 'Types',
  'error-handling': 'Error handling',
  async: 'Async',
  testing: 'Testing',
  formatting: 'Formatting',
  api: 'API',
  'data-access': 'Data access',
  other: 'Other',
} as const;

/** Code-fence language by file extension for evidence snippets ('' = no hint). */
export const FENCE_LANG_BY_EXT: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  mts: 'ts',
  cts: 'ts',
  js: 'js',
  jsx: 'jsx',
  mjs: 'js',
  cjs: 'js',
  json: 'json',
  md: 'md',
  css: 'css',
  scss: 'scss',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql',
  py: 'python',
  go: 'go',
  rs: 'rust',
};

/** Advisory-lock key prefix serializing re-scans of one repo. */
export const SCAN_LOCK_PREFIX = 'conventions:';
