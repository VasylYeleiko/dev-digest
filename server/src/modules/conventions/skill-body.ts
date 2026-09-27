import { ConventionCategory } from '@devdigest/shared';
import { CATEGORY_TITLES, FENCE_LANG_BY_EXT } from './constants.js';
import type { ConventionEntity } from './types.js';

/**
 * Merge accepted conventions into one skill body (ring 1, pure). The body is
 * what a reviewer agent reads in its system prompt, so it is written as
 * directives: one section per category, each rule followed by the evidence
 * that proves the repo really follows it.
 */

/** `path:12` or `path:12-18`. */
export function evidenceRef(row: Pick<ConventionEntity, 'evidencePath' | 'evidenceLineStart' | 'evidenceLineEnd'>): string | null {
  if (!row.evidencePath) return null;
  if (row.evidenceLineStart === null) return row.evidencePath;
  const end = row.evidenceLineEnd ?? row.evidenceLineStart;
  return end > row.evidenceLineStart
    ? `${row.evidencePath}:${row.evidenceLineStart}-${end}`
    : `${row.evidencePath}:${row.evidenceLineStart}`;
}

/** A fence longer than any backtick run inside the snippet, so it can't be closed early. */
function fenceFor(snippet: string): string {
  const longest = Math.max(0, ...(snippet.match(/`+/g) ?? []).map((run) => run.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

function fenceLang(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return FENCE_LANG_BY_EXT[ext] ?? '';
}

function ruleSection(row: ConventionEntity): string {
  const lines = [`### ${row.rule}`];
  const ref = evidenceRef(row);
  if (ref) lines.push('', `Evidence: \`${ref}\``);
  if (row.evidenceSnippet && row.evidencePath) {
    const fence = fenceFor(row.evidenceSnippet);
    lines.push(`${fence}${fenceLang(row.evidencePath)}`, row.evidenceSnippet, fence);
  }
  return lines.join('\n');
}

export function buildSkillBody(
  skillName: string,
  repoFullName: string,
  rows: readonly ConventionEntity[],
): string {
  const parts = [
    `# ${skillName}`,
    [
      `House conventions of \`${repoFullName}\`, extracted from its code and accepted by a reviewer.`,
      'When a CHANGED line breaks one of the rules below, report it and cite the offending `file:line`.',
      'Do not flag untouched code, and do not report a rule the diff simply doesn\'t exercise.',
    ].join('\n'),
  ];
  for (const category of ConventionCategory.options) {
    const inCategory = rows.filter((r) => r.category === category);
    if (inCategory.length === 0) continue;
    parts.push(`## ${CATEGORY_TITLES[category]}`, ...inCategory.map(ruleSection));
  }
  return `${parts.join('\n\n')}\n`;
}

export function draftDescription(count: number, repoFullName: string): string {
  return `${count} house ${count === 1 ? 'convention' : 'conventions'} extracted from ${repoFullName}`;
}

/** Distinct evidence files, in rule order — stored on the skill as `evidence_files`. */
export function evidenceFilesOf(rows: readonly ConventionEntity[]): string[] {
  return [...new Set(rows.flatMap((r) => (r.evidencePath ? [r.evidencePath] : [])))];
}
