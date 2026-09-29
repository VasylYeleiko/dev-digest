import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  changedTracked,
  collectDiffState,
  computeHash,
  discoverSkills,
  globToRegExp,
  loadRouting,
  mergeBase,
  parseAddedLines,
  routeFile,
} from './diff-state.mjs';
import { makeRepo } from './fixture.mjs';

const routing = loadRouting();

describe('globToRegExp', () => {
  it('handles **, *, ? and {a,b}', () => {
    assert.ok(globToRegExp('client/src/**/*.tsx').test('client/src/a/b/C.tsx'));
    assert.ok(globToRegExp('client/src/**/*.tsx').test('client/src/C.tsx'));
    assert.ok(!globToRegExp('client/src/*.tsx').test('client/src/a/C.tsx'));
    assert.ok(globToRegExp('**/*.{ts,tsx}').test('x/y.ts'));
    assert.ok(!globToRegExp('**/*.{ts,tsx}').test('x/y.tsx.bak'));
    assert.ok(globToRegExp('a?c').test('abc'));
    assert.ok(globToRegExp('client/src/app/[id]/**').test('client/src/app/[id]/page.tsx'), 'brackets are literal');
  });
});

describe('routeFile (real routing.json)', () => {
  const route = (p, content) => new Set(routeFile(p, routing, content));

  it('sends client components to the UI skills', () => {
    const s = route('client/src/app/agents/_components/List/List.tsx');
    for (const k of ['frontend-ui-architecture', 'react-best-practices', 'typescript-expert', 'security']) assert.ok(s.has(k), k);
    assert.ok(!s.has('onion-architecture'));
    assert.ok(!s.has('next-best-practices'), 'plain component without next import or directive');
  });

  it('sends Next route files and use-client modules to next-best-practices', () => {
    assert.ok(route('client/src/app/repos/[repoId]/page.tsx').has('next-best-practices'));
    assert.ok(route('client/src/lib/x.tsx', "'use client';\nexport {}").has('next-best-practices'));
  });

  it('sends server repositories to onion + drizzle, not UI skills', () => {
    const s = route('server/src/modules/pulls/repository.ts');
    for (const k of ['onion-architecture', 'drizzle-orm-patterns', 'typescript-expert', 'security']) assert.ok(s.has(k), k);
    assert.ok(!s.has('frontend-ui-architecture'));
  });

  it('routes zod and RTL by content', () => {
    assert.ok(route('reviewer-core/src/schema.ts', "import { z } from 'zod';").has('zod'));
    assert.ok(!route('reviewer-core/src/schema.ts', 'export const a = 1;').has('zod'));
    assert.ok(route('client/src/lib/x.test.ts', "import { render } from '@testing-library/react';").has('react-testing-library'));
    assert.ok(!route('client/src/lib/x.test.ts', 'import { it } from "vitest";').has('react-testing-library'));
  });

  it('excludes lock files, vendored UI, the client shared mirror and docs', () => {
    for (const p of ['server/pnpm-lock.yaml', 'client/src/vendor/ui/Button.tsx', 'client/src/vendor/shared/contracts/findings.ts', 'server/AGENTS.md', '.claude/hooks/pr-gate.mjs']) {
      assert.deepEqual(routeFile(p, routing), [], p);
    }
  });

  it('keeps migrations away from onion but gives SQL to postgresql-table-design', () => {
    const s = route('server/src/db/migrations/0012_add_x.sql');
    assert.ok(s.has('postgresql-table-design'));
    assert.ok(!s.has('onion-architecture'));
  });
});

describe('every skill on disk is routed or declared nonReview', () => {
  it('has no unrouted or missing skills', () => {
    const root = fileURLToPath(new URL('../../../../', import.meta.url));
    const { unrouted, missing } = discoverSkills(root, routing);
    assert.deepEqual(unrouted, []);
    assert.deepEqual(missing, []);
  });
});

describe('parseAddedLines', () => {
  it('tracks new-file line numbers and ignores headers', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      'index 1..2 100644',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -3,0 +4,2 @@ ctx',
      '+const x = 1;',
      '++++ looks like a header but is content',
      'diff --git a/gone.ts b/gone.ts',
      '--- a/gone.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-bye',
    ].join('\n');
    const added = parseAddedLines(diff);
    assert.deepEqual(added.get('a.ts'), [
      { line: 4, text: 'const x = 1;' },
      { line: 5, text: '+++ looks like a header but is content' },
    ]);
    assert.ok(!added.has('gone.ts'));
  });
});

describe('change set + content hash (fixture repo)', () => {
  const repo = makeRepo({ 'server/src/a.ts': 'export const a = 1;\n', 'server/src/old.ts': 'x\n' });
  after(() => repo.cleanup());

  it('sees committed, unstaged and untracked changes against main', () => {
    repo.write('server/src/a.ts', 'export const a = 2;\n');
    repo.commitAll('change a');
    repo.git('mv', 'server/src/old.ts', 'server/src/renamed.ts');
    repo.write('server/src/new.ts', 'export const n = 1;\n'); // untracked
    const base = mergeBase(repo.root);
    assert.equal(base.ref, 'main');
    const tracked = changedTracked(repo.root, base.sha);
    assert.deepEqual(tracked.map((f) => f.status + ' ' + f.path).sort(), ['M server/src/a.ts', 'R server/src/renamed.ts']);

    const state = collectDiffState(repo.root, routing);
    const newFile = state.files.find((f) => f.path === 'server/src/new.ts');
    assert.equal(newFile.status, 'A');
    assert.ok(newFile.skills.includes('onion-architecture'));
    assert.deepEqual(state.added.get('server/src/new.ts'), [{ line: 1, text: 'export const n = 1;' }]);
    assert.deepEqual(state.packages, ['server']);
  });

  it('keeps the hash when the same changes get committed, changes it on edit', () => {
    const before = computeHash(repo.root);
    repo.commitAll('commit everything');
    assert.equal(computeHash(repo.root), before, 'committing reviewed work must not invalidate the verdict');
    repo.write('server/src/new.ts', 'export const n = 2;\n');
    assert.notEqual(computeHash(repo.root), before);
  });

  it('changes the hash when an untracked file is added', () => {
    const before = computeHash(repo.root);
    repo.write('server/src/another.ts', 'x\n');
    assert.notEqual(computeHash(repo.root), before);
  });
});
