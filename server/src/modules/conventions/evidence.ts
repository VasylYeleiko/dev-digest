import { MAX_SNIPPET_LINES, MIN_SNIPPET_CHARS } from './constants.js';
import type { EvidenceCheck } from './types.js';

/**
 * VERIFY stage — the evidence gate (ring 1, pure). A candidate survives only
 * when the code it cites really exists in a file the model was shown. The
 * model's line numbers are a hint: the match closest to them wins and the
 * range is corrected. The snippet returned is sliced from the file itself, so
 * nothing the model typed reaches the UI as "evidence".
 */

/** Line-number gutter the prompt adds (`  12 | code`) — models sometimes copy it. */
const GUTTER = /^\s*\d+\s*\|\s?/;

/** `./src\\a.ts`, `/src/a.ts`, `source:src/a.ts` → `src/a.ts`. */
export function normalizeEvidencePath(path: string): string {
  return path
    .trim()
    .replace(/^(config|source):/, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

/** Whitespace-insensitive form of one line of code. */
function normLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

/**
 * The snippet as a list of normalized, non-empty lines (capped). The gutter is
 * stripped only when EVERY line carries one, so real code like `1 | 2` isn't
 * mangled.
 */
export function snippetLines(snippet: string): string[] {
  const raw = snippet.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const hasGutter = raw.length > 0 && raw.every((l) => GUTTER.test(l));
  return raw
    .map((l) => normLine(hasGutter ? l.replace(GUTTER, '') : l))
    .filter((l) => l.length > 0)
    .slice(0, MAX_SNIPPET_LINES);
}

/** Remove the indentation every non-empty line shares (display only). */
export function dedent(text: string): string {
  const lines = text.split('\n');
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^[ \t]*/)![0].length);
  const common = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(common)).join('\n');
}

export interface CitedEvidence {
  file: string;
  line_start: number;
  line_end: number;
  snippet: string;
}

/**
 * Check one candidate's evidence against the sampled files (path → exactly the
 * text the model saw). Each snippet line must occur, in order, inside
 * consecutive non-blank file lines (substring match, so a partial first/last
 * line still counts).
 */
export function verifyEvidence(
  cited: CitedEvidence,
  files: ReadonlyMap<string, string>,
): EvidenceCheck {
  const path = normalizeEvidencePath(cited.file);
  const content = files.get(path);
  if (content === undefined) return { ok: false, reason: 'file_not_sampled' };

  const snip = snippetLines(cited.snippet);
  if (snip.length === 0) return { ok: false, reason: 'empty_snippet' };
  if (snip.join('').replace(/\s/g, '').length < MIN_SNIPPET_CHARS) {
    return { ok: false, reason: 'trivial_snippet' };
  }

  const fileLines = content.split(/\r?\n/);
  const nonBlank = fileLines
    .map((text, i) => ({ line: i + 1, text: normLine(text) }))
    .filter((l) => l.text.length > 0);

  let best: { start: number; end: number } | undefined;
  for (let s = 0; s + snip.length <= nonBlank.length; s++) {
    let hit = true;
    for (let j = 0; j < snip.length; j++) {
      if (!nonBlank[s + j]!.text.includes(snip[j]!)) {
        hit = false;
        break;
      }
    }
    if (!hit) continue;
    const start = nonBlank[s]!.line;
    const end = nonBlank[s + snip.length - 1]!.line;
    if (!best || Math.abs(start - cited.line_start) < Math.abs(best.start - cited.line_start)) {
      best = { start, end };
    }
  }
  if (!best) return { ok: false, reason: 'snippet_not_found' };

  return {
    ok: true,
    evidence: {
      path,
      lineStart: best.start,
      lineEnd: best.end,
      snippet: dedent(fileLines.slice(best.start - 1, best.end).join('\n')),
      corrected: best.start !== cited.line_start || best.end !== cited.line_end,
    },
  };
}
