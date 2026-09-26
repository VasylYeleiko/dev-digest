import { describe, it, expect } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import { sliceDiff } from '../src/index.js';

const raw = [
  'diff --git a/src/foo.ts b/src/foo.ts',
  '--- a/src/foo.ts',
  '+++ b/src/foo.ts',
  '@@ -1 +1 @@',
  '+ts change',
  'diff --git a/src/foo.tsx b/src/foo.tsx',
  '--- a/src/foo.tsx',
  '+++ b/src/foo.tsx',
  '@@ -1 +1 @@',
  '+tsx change',
].join('\n');

const diff: UnifiedDiff = {
  raw,
  files: [
    { path: 'src/foo.ts', additions: 1, deletions: 0, hunks: [] },
    { path: 'src/foo.tsx', additions: 1, deletions: 0, hunks: [] },
  ],
};

describe('sliceDiff', () => {
  it('returns only the requested file, not files whose path merely contains it', () => {
    const ts = sliceDiff(diff, 'src/foo.ts');
    expect(ts).toContain('+ts change');
    expect(ts).not.toContain('foo.tsx');
  });

  it('still slices the longer path on its own', () => {
    const tsx = sliceDiff(diff, 'src/foo.tsx');
    expect(tsx).toContain('+tsx change');
    expect(tsx).not.toContain('+ts change\n');
  });
});
