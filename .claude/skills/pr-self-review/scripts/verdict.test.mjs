import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { cachedFindings, loadCache, planReview, pruneCache, saveCache, selectSkills, storeResults } from './cache.mjs';
import { write } from './fixture.mjs';
import { applyAccepted, countBySeverity, decide, dedupe, validateAccepted } from './verdict.mjs';

const TODAY = new Date('2026-09-23T12:00:00Z');
const entry = (over = {}) => ({
  skill: 'onion-architecture', rule: 'thin routes', file: 'server/src/a/routes.ts',
  match: 'db.select', reason: 'bootstrap route, no service yet', expires: '2026-10-15', ...over,
});

describe('validateAccepted', () => {
  it('keeps complete, unexpired entries within 90 days', () => {
    const { valid, ignored } = validateAccepted([entry()], TODAY);
    assert.equal(valid.length, 1);
    assert.equal(ignored.length, 0);
  });

  it('ignores incomplete, expired, far-future and check entries', () => {
    const { valid, ignored } = validateAccepted([
      entry({ reason: '' }),
      entry({ expires: '2026-09-22' }),
      entry({ expires: '2027-06-01' }),
      entry({ expires: 'next month' }),
      entry({ skill: 'checks' }),
    ], TODAY);
    assert.equal(valid.length, 0);
    assert.deepEqual(ignored.map((i) => i.why.split(' ')[0]), ['missing', 'expired', 'expires', 'expires', 'deterministic']);
  });

  it('treats a non-array as empty', () => {
    assert.deepEqual(validateAccepted({}, TODAY), { valid: [], ignored: [] });
  });
});

describe('applyAccepted', () => {
  const llm = { source: 'llm', skill: 'onion-architecture', file: 'server/src/a/routes.ts', line: 3, severity: 'CRITICAL', rule: 'thin routes', evidence: 'await db.select().from(x)' };
  const check = { source: 'check', skill: 'onion-architecture', file: 'server/src/a/routes.ts', severity: 'CRITICAL', rule: 'thin routes', evidence: 'db.select' };

  it('accepts matching reviewer findings only', () => {
    const { kept, accepted } = applyAccepted([llm, check], [entry()]);
    assert.deepEqual(kept, [check], 'check findings can never be accepted');
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].accepted.reason, 'bootstrap route, no service yet');
  });

  it('requires file, skill, rule and evidence substring to match', () => {
    assert.equal(applyAccepted([llm], [entry({ match: 'db.insert' })]).accepted.length, 0);
    assert.equal(applyAccepted([llm], [entry({ file: 'server/src/b/routes.ts' })]).accepted.length, 0);
    assert.equal(applyAccepted([llm], [entry({ rule: 'other rule' })]).accepted.length, 0);
  });
});

describe('dedupe + decide', () => {
  it('collapses same file:line across skills into the most severe finding', () => {
    const out = dedupe([
      { skill: 'typescript-expert', file: 'a.ts', line: 4, severity: 'WARNING', rule: 'any' },
      { skill: 'security', file: 'a.ts', line: 4, severity: 'CRITICAL', rule: 'injection' },
      { skill: 'security', file: 'a.ts', line: 9, severity: 'SUGGESTION', rule: 'x' },
      { source: 'check', skill: 'checks', file: 'a.ts', line: 4, severity: 'CRITICAL', rule: 'secret' },
    ]);
    assert.equal(out.length, 3);
    const merged = out.find((f) => f.skill === 'security' && f.line === 4);
    assert.deepEqual(merged.also, [{ skill: 'typescript-expert', severity: 'WARNING', rule: 'any' }]);
    assert.deepEqual(countBySeverity(out), { CRITICAL: 2, WARNING: 0, SUGGESTION: 1 });
  });

  it('BLOCKED beats INCOMPLETE beats PASS', () => {
    assert.equal(decide({ counts: { CRITICAL: 1 }, missing: [{}], llmSkipped: true }), 'BLOCKED');
    assert.equal(decide({ counts: { CRITICAL: 0 }, missing: [{}], llmSkipped: false }), 'INCOMPLETE');
    assert.equal(decide({ counts: { CRITICAL: 0 }, missing: [], llmSkipped: true }), 'INCOMPLETE');
    assert.equal(decide({ counts: { CRITICAL: 0 }, missing: [], llmSkipped: false }), 'PASS');
  });
});

describe('incremental cache', () => {
  const root = mkdtempSync(join(tmpdir(), 'pr-self-review-cache-'));
  after(() => rmSync(root, { recursive: true, force: true }));
  write(root, '.claude/skills/onion-architecture/SKILL.md', 'v1');
  write(root, '.claude/skills/security/SKILL.md', 'v1');

  const state = (hashes) => ({
    root,
    files: Object.entries(hashes).map(([path, fileHash]) => ({ path, fileHash })),
    bySkill: {
      'onion-architecture': { model: 'inherit', chunkSize: 1, files: Object.keys(hashes) },
      security: { model: 'inherit', chunkSize: 5, files: Object.keys(hashes) },
    },
  });

  it('plans everything on a cold cache, chunked by chunkSize', () => {
    const s = state({ 'a.ts': 'h1', 'b.ts': 'h1' });
    const plan = planReview(s, loadCache(root), { skills: selectSkills(s) });
    assert.deepEqual(plan['onion-architecture'].chunks, [['a.ts'], ['b.ts']]);
    assert.deepEqual(plan.security.chunks, [['a.ts', 'b.ts']]);
  });

  it('reuses clean and dirty results, re-plans only changed files', () => {
    const s1 = state({ 'a.ts': 'h1', 'b.ts': 'h1' });
    const cache = loadCache(root);
    const finding = { skill: 'onion-architecture', file: 'a.ts', line: 1, severity: 'CRITICAL', rule: 'r', evidence: 'e' };
    const stray = { skill: 'security', file: 'elsewhere.ts', line: 1, severity: 'WARNING', rule: 'r', evidence: 'e' };
    const { dropped } = storeResults(s1, cache, {
      reviewed: { 'onion-architecture': ['a.ts', 'b.ts'], security: ['a.ts', 'b.ts'] },
      findings: [finding, stray],
    });
    assert.deepEqual(dropped, [stray]);
    saveCache(root, cache);

    const reloaded = loadCache(root);
    assert.deepEqual(cachedFindings(s1, reloaded, selectSkills(s1)), { findings: [finding], missing: [] });

    const s2 = state({ 'a.ts': 'h1', 'b.ts': 'h2' });
    const plan = planReview(s2, reloaded, { skills: selectSkills(s2) });
    assert.deepEqual(plan['onion-architecture'].pending, ['b.ts']);
    assert.deepEqual(plan['onion-architecture'].cached, ['a.ts']);
    assert.deepEqual(cachedFindings(s2, reloaded, ['security']).missing, [{ skill: 'security', file: 'b.ts' }]);
    assert.deepEqual(planReview(s2, reloaded, { skills: ['security'], fresh: true }).security.pending, ['a.ts', 'b.ts']);
  });

  it('invalidates a skill when its SKILL.md changes', () => {
    const s = state({ 'a.ts': 'h1', 'b.ts': 'h1' });
    write(root, '.claude/skills/security/SKILL.md', 'v2');
    const plan = planReview(s, loadCache(root), { skills: selectSkills(s) });
    assert.deepEqual(plan.security.pending, ['a.ts', 'b.ts']);
    assert.deepEqual(plan['onion-architecture'].pending, []);
  });

  it('selects skills for quick / explicit runs and prunes files that left the change set', () => {
    const s = state({ 'a.ts': 'h1' });
    assert.deepEqual(selectSkills(s, { quick: true }), ['security']);
    assert.deepEqual(selectSkills(s, { skills: ['onion-architecture', 'nope'] }), ['onion-architecture']);
    const cache = loadCache(root);
    pruneCache(s, cache);
    assert.ok(Object.keys(cache.entries).every((k) => k.endsWith('\u0000a.ts')));
  });
});
