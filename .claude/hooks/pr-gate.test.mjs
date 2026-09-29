import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { computeHash } from '../skills/pr-self-review/scripts/diff-state.mjs';
import { makeRepo } from '../skills/pr-self-review/scripts/fixture.mjs';
import { evaluate, isGated } from './pr-gate.mjs';

const HOOK = fileURLToPath(new URL('./pr-gate.mjs', import.meta.url));
const DIFF_STATE = fileURLToPath(new URL('../skills/pr-self-review/scripts/diff-state.mjs', import.meta.url));

describe('isGated', () => {
  it('gates PR creation, merge and push — nothing else', () => {
    for (const c of ['gh pr create --fill', 'cd x && gh pr merge 12 --squash', 'git push', 'git push -u origin L02', 'git -C server push', 'git -c a=b push --force-with-lease']) {
      assert.ok(isGated(c), c);
    }
    for (const c of ['gh pr view 3', 'gh pr list', 'git status', 'git log --oneline', 'git stash push -m x', 'echo pushing', undefined]) {
      assert.ok(!isGated(c), String(c));
    }
  });
});

describe('evaluate (fixture repo)', () => {
  const repo = makeRepo({ 'server/src/a.ts': 'export const a = 1;\n' });
  mkdirSync(join(repo.root, '.claude/skills/pr-self-review/scripts'), { recursive: true });
  copyFileSync(DIFF_STATE, join(repo.root, '.claude/skills/pr-self-review/scripts/diff-state.mjs'));
  repo.write('.gitignore', '.claude/pr-self-review/*\n');
  repo.commitAll('add skill script');
  repo.write('server/src/a.ts', 'export const a = 2;\n');
  after(() => repo.cleanup());

  const lastRun = (run) => {
    mkdirSync(join(repo.root, '.claude/pr-self-review'), { recursive: true });
    writeFileSync(join(repo.root, '.claude/pr-self-review/last-run.json'), JSON.stringify(run));
  };

  it('lets ungated commands through without touching git', async () => {
    assert.equal(await evaluate('ls', '/nonexistent'), null);
  });

  it('denies without a review on record', async () => {
    assert.match(await evaluate('gh pr create', repo.root, {}), /no review on record/);
  });

  it('allows a full PASS for the current hash, and only that', async () => {
    const hash = computeHash(repo.root);
    lastRun({ hash, mode: 'full', verdict: 'PASS', counts: { CRITICAL: 0 } });
    assert.equal(await evaluate('git push', repo.root, {}), null);

    lastRun({ hash, mode: 'quick', verdict: 'PASS' });
    assert.match(await evaluate('git push', repo.root, {}), /partial \(quick\)/);

    lastRun({ hash, mode: 'full', verdict: 'BLOCKED', counts: { CRITICAL: 2 } });
    assert.match(await evaluate('gh pr merge 1', repo.root, {}), /BLOCKED \(2 CRITICAL/);

    lastRun({ hash, mode: 'full', verdict: 'PASS' });
    repo.write('server/src/a.ts', 'export const a = 3;\n');
    assert.match(await evaluate('gh pr create', repo.root, {}), /differ from what was last reviewed/);
  });

  it('honours the user-only bypass', async () => {
    assert.equal(await evaluate('gh pr create', repo.root, { PR_SELF_REVIEW_BYPASS: '1' }), null);
  });

  it('emits a PreToolUse deny payload over stdin/stdout', () => {
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'gh pr create' }, cwd: repo.root });
    const r = spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8', env: { ...process.env, PR_SELF_REVIEW_BYPASS: '' } });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /^pr-self-review: /);

    const ok = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } }), encoding: 'utf8' });
    assert.equal(ok.status, 0);
    assert.equal(ok.stdout, '');
  });
});
