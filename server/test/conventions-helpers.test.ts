import { describe, it, expect } from 'vitest';
import { verifyEvidence, normalizeEvidencePath, snippetLines } from '../src/modules/conventions/evidence.js';
import {
  configCandidates,
  packageRootOf,
  stratifySample,
  packageRootsOf,
  truncateForPrompt,
  withLineGutter,
} from '../src/modules/conventions/sampling.js';
import { clampConfidence, gateCandidates, ruleKey } from '../src/modules/conventions/helpers.js';
import { MAX_LINES_PER_FILE } from '../src/modules/conventions/constants.js';
import type { ExtractedConvention } from '../src/modules/conventions/llm-schema.js';

/**
 * Pure rings of the Conventions Extractor: the evidence gate (the only thing
 * standing between a model's claim and the UI), sampling, and candidate triage.
 */

const USERS_TS = [
  "import { db } from '../db';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  const posts = await db.posts.findMany({ userId: id });',
  '  return { user, posts };',
  '}',
  '',
  'export async function getPost(id: string) {',
  '  const post = await db.posts.find(id);',
  '  return post;',
  '}',
].join('\n');

const files = new Map([['src/api/users.ts', USERS_TS]]);

describe('verifyEvidence', () => {
  it('accepts a verbatim snippet and slices the evidence from the file itself', () => {
    const res = verifyEvidence(
      {
        file: 'src/api/users.ts',
        line_start: 4,
        line_end: 5,
        snippet: 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId: id });',
      },
      files,
    );
    expect(res).toEqual({
      ok: true,
      evidence: {
        path: 'src/api/users.ts',
        lineStart: 4,
        lineEnd: 5,
        snippet:
          'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId: id });',
        corrected: false,
      },
    });
  });

  it('corrects wrong line numbers, tolerates copied gutters, prefixes and whitespace drift', () => {
    const res = verifyEvidence(
      {
        file: 'source:./src\\api\\users.ts',
        line_start: 40,
        line_end: 41,
        snippet: ' 10 |   const   post = await db.posts.find(id);\n 11 |   return post;',
      },
      files,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.evidence).toMatchObject({ path: 'src/api/users.ts', lineStart: 10, lineEnd: 11, corrected: true });
    expect(res.evidence.snippet).toBe('const post = await db.posts.find(id);\nreturn post;');
  });

  it('picks the occurrence closest to the cited line when a snippet repeats', () => {
    const repeated = new Map([['a.ts', 'await db.posts.find(id);\nx();\nawait db.posts.find(id);']]);
    const res = verifyEvidence(
      { file: 'a.ts', line_start: 3, line_end: 3, snippet: 'await db.posts.find(id);' },
      repeated,
    );
    expect(res.ok && res.evidence.lineStart).toBe(3);
  });

  it('drops invented code, unsampled files, empty and trivial snippets', () => {
    const cite = (file: string, snippet: string) =>
      verifyEvidence({ file, line_start: 1, line_end: 1, snippet }, files);
    expect(cite('src/api/users.ts', 'const user = await db.users.findOne(id);')).toEqual({
      ok: false,
      reason: 'snippet_not_found',
    });
    expect(cite('src/api/orders.ts', 'const user = await db.users.find(id);')).toEqual({
      ok: false,
      reason: 'file_not_sampled',
    });
    expect(cite('src/api/users.ts', '   \n  ')).toEqual({ ok: false, reason: 'empty_snippet' });
    expect(cite('src/api/users.ts', '}')).toEqual({ ok: false, reason: 'trivial_snippet' });
  });

  it('only strips a gutter when every line has one', () => {
    expect(snippetLines('1 | a\n2 | b')).toEqual(['a', 'b']);
    expect(snippetLines('const x = 1 | 2;\nfoo()')).toEqual(['const x = 1 | 2;', 'foo()']);
    expect(normalizeEvidencePath('config:/tsconfig.json')).toBe('tsconfig.json');
  });
});

describe('sampling', () => {
  it('probes the repo root plus the top-level package dirs of the ranked sample', () => {
    const roots = packageRootsOf(['server/src/a.ts', 'client/src/b.tsx', 'server/src/c.ts', 'README.md']);
    expect(roots).toEqual(['', 'server', 'client']);
    const paths = configCandidates(roots);
    expect(paths[0]).toBe('tsconfig.json');
    expect(paths).toContain('server/eslint.config.js');
    expect(paths).toContain('client/.prettierrc');
  });

  it('spreads the sample across packages instead of letting the most central one take every slot', () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => `server/src/platform/p${i}.ts`),
      'client/src/app/page.tsx',
      'client/src/lib/api.ts',
      'packages/ui/src/Button.tsx',
      'README.ts',
    ];
    const picked = stratifySample(pool, 6);
    expect(picked).toEqual([
      'server/src/platform/p0.ts',
      'client/src/app/page.tsx',
      'packages/ui/src/Button.tsx',
      'README.ts',
      'server/src/platform/p1.ts',
      'client/src/lib/api.ts',
    ]);
    // One package, one dir → plain rank order, unchanged.
    expect(stratifySample(['src/a.ts', 'src/b.ts', 'src/c.ts'], 2)).toEqual(['src/a.ts', 'src/b.ts']);
    // Inside a package, directories take turns; tooling dirs never count.
    expect(
      stratifySample(
        ['.claude/skills/x.ts', 'client/src/app/A.tsx', 'client/src/app/B.tsx', 'client/src/lib/api.ts'],
        3,
      ),
    ).toEqual(['client/src/app/A.tsx', 'client/src/lib/api.ts', 'client/src/app/B.tsx']);
    expect(packageRootOf('packages/ui/src/Button.tsx')).toBe('packages/ui');
    expect(packageRootOf('packages/readme.md')).toBe('packages');
  });

  it('shares the config budget across packages (name-major probing)', () => {
    expect(configCandidates(['', 'server', 'client']).slice(0, 4)).toEqual([
      'tsconfig.json',
      'server/tsconfig.json',
      'client/tsconfig.json',
      'tsconfig.base.json',
    ]);
  });

  it('caps a file to the line budget and numbers lines for citation', () => {
    const long = Array.from({ length: MAX_LINES_PER_FILE + 5 }, (_, i) => `line ${i + 1}`).join('\n');
    const { text, truncated } = truncateForPrompt(long);
    expect(truncated).toBe(true);
    expect(text.split('\n')).toHaveLength(MAX_LINES_PER_FILE);
    expect(withLineGutter('a\nb')).toBe('1 | a\n2 | b');
  });
});

describe('gateCandidates', () => {
  const candidate = (rule: string, snippet: string, confidence = 0.8): ExtractedConvention => ({
    rule,
    category: 'async',
    confidence,
    evidence: { file: 'src/api/users.ts', line_start: 4, line_end: 4, snippet },
  });

  it('keeps grounded rules, drops ungrounded ones, skips already-triaged and repeated rules', () => {
    const out = gateCandidates(
      [
        candidate('Use async/await instead of .then() chains.', 'const user = await db.users.find(id);', 1.7),
        candidate('Wrap every DB call in a transaction.', 'await db.transaction(async (tx) => {'),
        candidate('Name handlers after the resource.', 'export async function getPost(id: string) {'),
        candidate('use  ASYNC/await instead of `.then()` chains', 'const post = await db.posts.find(id);'),
      ],
      files,
      ['Name handlers after the resource'],
    );
    expect(out.dropped).toBe(1);
    expect(out.skipped).toBe(2);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({
      rule: 'Use async/await instead of .then() chains.',
      evidencePath: 'src/api/users.ts',
      evidenceLineStart: 4,
      confidence: 1,
    });
  });

  it('normalizes rule keys and clamps junk scores', () => {
    expect(ruleKey('Use `async`/await!')).toBe(ruleKey('use async/await'));
    expect(clampConfidence(-2)).toBe(0);
    expect(clampConfidence(0.8349)).toBe(0.83);
    expect(clampConfidence(Number.NaN)).toBeNull();
  });
});
