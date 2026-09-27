import { wrapUntrusted } from '../../platform/prompt.js';
import {
  CONFIG_FILE_NAMES,
  MAX_CHARS_PER_FILE,
  MAX_LINES_PER_FILE,
  MAX_PACKAGE_ROOTS,
  PACKAGE_CONTAINER_DIRS,
} from './constants.js';
import type { SampledFile } from './types.js';

/**
 * SAMPLE stage — pure helpers (ring 1). Which paths to read and how the read
 * files are rendered for the model. No I/O: the service does the reads.
 */

/**
 * The package a path belongs to, by directory convention: its top-level dir
 * (`server/src/a.ts` → `server`), or two levels under a monorepo container
 * (`packages/ui/src/b.tsx` → `packages/ui`). '' for a file at the repo root.
 */
export function packageRootOf(path: string): string {
  const parts = path.split('/');
  if (parts.length < 2) return '';
  if (parts.length > 2 && (PACKAGE_CONTAINER_DIRS as readonly string[]).includes(parts[0]!)) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0]!;
}

/**
 * Package roots worth probing for config: the repo root ('') plus the
 * packages the sample lives in, in first-seen order, capped.
 */
export function packageRootsOf(samplePaths: readonly string[]): string[] {
  const roots = [''];
  for (const p of samplePaths) {
    const root = packageRootOf(p);
    if (root && !roots.includes(root)) roots.push(root);
    if (roots.length >= MAX_PACKAGE_ROOTS + 1) break;
  }
  return roots;
}

/**
 * Every config path to probe, name-major: `tsconfig.json` at every root, then
 * the eslint configs at every root, … — so the config budget is shared across
 * packages instead of the first package's files using all of it.
 */
export function configCandidates(roots: readonly string[]): string[] {
  return CONFIG_FILE_NAMES.flatMap((name) => roots.map((root) => (root ? `${root}/${name}` : name)));
}

/** Tooling/meta dirs (`.claude/`, `.github/`, …) — not the product's code. */
function isHiddenPath(path: string): boolean {
  return path.split('/').some((segment) => segment.startsWith('.'));
}

function parentDir(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/** Group by `keyOf` (first-seen order), keeping each group's input order. */
function groupBy(paths: readonly string[], keyOf: (p: string) => string): string[][] {
  const groups = new Map<string, string[]>();
  for (const p of paths) {
    const key = keyOf(p);
    const group = groups.get(key);
    if (group) group.push(p);
    else groups.set(key, [p]);
  }
  return [...groups.values()];
}

/** Take one from each group per round until `n` or every group is empty. */
function roundRobin(groups: string[][], n: number): string[] {
  const queues = groups.map((g) => [...g]);
  const out: string[] = [];
  while (out.length < n && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift();
      if (next !== undefined && out.length < n) out.push(next);
    }
  }
  return out;
}

/**
 * Pick `n` files from a rank-ordered pool: round-robin across packages, and
 * inside a package across directories. Plain top-N lets one package take every
 * slot (in dev-digest the first 12 were all `server/src/platform/…`, so no
 * client rule could surface) — and when the import graph is empty every rank
 * ties, so "top-N" is just arbitrary row order. Spreading keeps the sample
 * representative either way; within a group, rank order still wins.
 */
export function stratifySample(rankedPool: readonly string[], n: number): string[] {
  const visible = rankedPool.filter((p) => !isHiddenPath(p));
  const perPackage = groupBy(visible, packageRootOf).map((pkg) =>
    roundRobin(groupBy(pkg, parentDir), pkg.length),
  );
  return roundRobin(perPackage, n);
}

/** Cap a file to the per-file budget; says whether anything was cut. */
export function truncateForPrompt(content: string): { text: string; truncated: boolean } {
  const lines = content.split(/\r?\n/);
  let text = lines.slice(0, MAX_LINES_PER_FILE).join('\n');
  let truncated = lines.length > MAX_LINES_PER_FILE;
  if (text.length > MAX_CHARS_PER_FILE) {
    text = text.slice(0, MAX_CHARS_PER_FILE);
    // Don't hand the model a half line it might quote as evidence.
    const lastNl = text.lastIndexOf('\n');
    if (lastNl > 0) text = text.slice(0, lastNl);
    truncated = true;
  }
  return { text, truncated };
}

/** Prefix every line with a right-aligned 1-based line number + ` | `. */
export function withLineGutter(text: string): string {
  const lines = text.split('\n');
  const width = String(lines.length).length;
  return lines.map((l, i) => `${String(i + 1).padStart(width, ' ')} | ${l}`).join('\n');
}

/**
 * One sampled file as the model sees it: wrapped as untrusted DATA (repo code
 * may contain instructions aimed at the model) with a line gutter to cite from.
 * `content` must already be truncated — the gate verifies against the same text.
 */
export function renderSampledFile(file: SampledFile, truncated: boolean): string {
  const note = truncated ? '\n… (truncated)' : '';
  return wrapUntrusted(`${file.kind}:${file.path}`, withLineGutter(file.content) + note);
}

/** The user message: config files first (tooling-enforced rules), then source. */
export function renderUserMessage(repoName: string, rendered: readonly string[]): string {
  return [
    `Repository: ${repoName}`,
    `Sampled files (${rendered.length}):`,
    ...rendered,
  ].join('\n\n');
}
