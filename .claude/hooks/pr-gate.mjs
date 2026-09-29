#!/usr/bin/env node
// PreToolUse gate (Bash|PowerShell): denies `gh pr create`, `gh pr merge` and
// `git push` unless the last full /pr-self-review run is PASS for exactly the
// current change set (same content hash). Fails closed on gated commands.
//
// Human-only escape hatch: PR_SELF_REVIEW_BYPASS=1 in the user's own
// environment. An agent must never set it.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SKILL_SCRIPT = '.claude/skills/pr-self-review/scripts/diff-state.mjs';

export const GATED = [
  /\bgh\s+pr\s+(?:create|merge)\b/,
  /\bgit(?:\s+-[Cc]\s+\S+)*\s+push\b/,
];

export function isGated(command) {
  return typeof command === 'string' && GATED.some((re) => re.test(command));
}

/** Returns null when allowed, or the deny reason. */
export async function evaluate(command, root, env = process.env) {
  if (!isGated(command)) return null;
  if (env.PR_SELF_REVIEW_BYPASS === '1') return null;

  const { computeHash } = await import(pathToFileURL(join(root, SKILL_SCRIPT)).href);
  const lastRunPath = join(root, '.claude/pr-self-review/last-run.json');
  if (!existsSync(lastRunPath)) return 'no review on record';

  let run;
  try {
    run = JSON.parse(readFileSync(lastRunPath, 'utf8'));
  } catch {
    return 'last-run.json is unreadable';
  }
  let hash;
  try {
    hash = computeHash(root);
  } catch (err) {
    return `cannot compute the current change set (${err.message})`;
  }
  if (run.hash !== hash) return 'the changes differ from what was last reviewed';
  if (run.mode !== 'full') return `the last run was a partial (${run.mode}) review — only a full run can unlock a PR`;
  if (run.verdict !== 'PASS') {
    const c = run.counts ?? {};
    return `last verdict is ${run.verdict}${run.verdict === 'BLOCKED' ? ` (${c.CRITICAL ?? '?'} CRITICAL finding(s), see .claude/pr-self-review/report.md)` : ''}`;
  }
  return null;
}

/**
 * The repo the command runs in: the git top level of the hook's `cwd` (so a
 * worktree is judged by its own changes and its own verdict), falling back to
 * the project dir when that checkout has no pr-self-review skill.
 */
function resolveRoot(cwd) {
  const fallback = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (!cwd) return fallback;
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return existsSync(join(top, SKILL_SCRIPT)) ? top : fallback;
  } catch {
    return fallback;
  }
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `pr-self-review: ${reason}. Run /pr-self-review first; fix every CRITICAL before opening or merging a PR. (Do not set PR_SELF_REVIEW_BYPASS — that is the user's call.)`,
    },
  }));
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input = {};
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    return; // not a hook payload we understand — do not block unrelated tools
  }
  const command = input.tool_input?.command;
  if (!isGated(command)) return;
  try {
    const reason = await evaluate(command, resolveRoot(input.cwd));
    if (reason) deny(reason);
  } catch (err) {
    deny(`gate error (${err.message})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
