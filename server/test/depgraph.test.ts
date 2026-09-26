/**
 * depgraph adapter (DepCruiseGraph) unit tests.
 *
 * No DB, no git. Regression for edgesWritten=0 on Windows: cruise paths were
 * normalised with `relative()` (backslashes) while `walk.ts` emits forward
 * slashes, so no edge ever matched the indexed file set and PageRank went flat.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path, { dirname, join } from 'node:path';
import { DepCruiseGraph, groupByTsConfig, toRepoRel } from '../src/adapters/depgraph/index.js';

async function writeFileAt(root: string, rel: string, contents: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, contents);
}

describe('toRepoRel', () => {
  it('returns forward-slash paths for Windows absolute paths', () => {
    expect(
      toRepoRel('C:\\clones\\acme\\repo', 'C:\\clones\\acme\\repo\\server\\src\\a.ts', path.win32),
    ).toBe('server/src/a.ts');
  });

  it('leaves POSIX paths unchanged', () => {
    expect(toRepoRel('/clones/acme/repo', '/clones/acme/repo/src/a.ts', path.posix)).toBe(
      'src/a.ts',
    );
  });
});

describe('DepCruiseGraph.buildEdges', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'repo-intel-depgraph-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('emits repo-relative POSIX edges matching the walked file list', async () => {
    // Multi-package layout, no root tsconfig, `.js` specifiers for `.ts` files.
    await writeFileAt(root, 'server/src/lib/b.ts', 'export const b = 1;');
    await writeFileAt(
      root,
      'server/src/a.ts',
      "import { b } from './lib/b.js';\nexport const a = b;",
    );
    await writeFileAt(root, 'client/src/c.ts', "import { a } from '../../server/src/a.js';\nexport const c = a;");
    const files = ['client/src/c.ts', 'server/src/a.ts', 'server/src/lib/b.ts'];

    const edges = await new DepCruiseGraph().buildEdges(root, files);

    expect(edges).toEqual(
      expect.arrayContaining([
        { from: 'server/src/a.ts', to: 'server/src/lib/b.ts' },
        { from: 'client/src/c.ts', to: 'server/src/a.ts' },
      ]),
    );
    expect(edges).toHaveLength(2);
  });

  it('resolves each package\'s tsconfig `paths` aliases against its own tsconfig', async () => {
    // No root tsconfig; `@/*` maps to a DIFFERENT dir in each package, so a
    // single shared config can't resolve both. Tests run with cwd = server/,
    // never the fixture root — also guards the baseUrl-vs-cwd trap in runCruise.
    const tsconfig = (paths: Record<string, string[]>) =>
      JSON.stringify({ compilerOptions: { module: 'NodeNext', paths } });
    await writeFileAt(root, 'pkg-a/tsconfig.json', tsconfig({ '@/*': ['./src/*'] }));
    await writeFileAt(
      root,
      'pkg-b/tsconfig.json',
      tsconfig({ '@/*': ['./src/*'], '@shared/*': ['../pkg-a/src/*'] }),
    );
    await writeFileAt(root, 'pkg-a/src/lib/util.ts', 'export const util = 1;');
    await writeFileAt(root, 'pkg-a/src/index.ts', "import { util } from '@/lib/util.js';\nexport const a = util;");
    await writeFileAt(root, 'pkg-b/src/lib/util.ts', 'export const util = 2;');
    await writeFileAt(
      root,
      'pkg-b/src/index.ts',
      "import { util } from '@/lib/util.js';\nimport { a } from '@shared/index.js';\nexport const b = util + a;",
    );
    // No tsconfig anywhere above it → cruised without one; relative still resolves.
    await writeFileAt(root, 'scripts/run.ts', "import { b } from '../pkg-b/src/index.js';\nexport const r = b;");
    const files = [
      'pkg-a/src/index.ts',
      'pkg-a/src/lib/util.ts',
      'pkg-b/src/index.ts',
      'pkg-b/src/lib/util.ts',
      'scripts/run.ts',
    ];

    const edges = await new DepCruiseGraph().buildEdges(root, files);

    expect(edges).toEqual(
      expect.arrayContaining([
        { from: 'pkg-a/src/index.ts', to: 'pkg-a/src/lib/util.ts' },
        { from: 'pkg-b/src/index.ts', to: 'pkg-b/src/lib/util.ts' },
        { from: 'pkg-b/src/index.ts', to: 'pkg-a/src/index.ts' },
        { from: 'scripts/run.ts', to: 'pkg-b/src/index.ts' },
      ]),
    );
    // Deduped: pkg-a is also reached (and re-cruised) from pkg-b's run.
    expect(edges).toHaveLength(4);
  });
});

describe('groupByTsConfig', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'repo-intel-depgraph-group-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('keys each file by its nearest ancestor tsconfig dir, null when none', async () => {
    await writeFileAt(root, 'server/tsconfig.json', '{}');
    await writeFileAt(root, 'server/src/deep/tsconfig.json', '{}');

    const groups = groupByTsConfig(root, [
      'server/src/a.ts',
      'server/src/deep/x/b.ts',
      'top.ts',
      'client/src/c.ts',
    ]);

    expect(Object.fromEntries(groups)).toEqual({
      server: ['server/src/a.ts'],
      'server/src/deep': ['server/src/deep/x/b.ts'],
      null: ['top.ts', 'client/src/c.ts'],
    });
  });

  it('uses the root tsconfig (key "") when it is the nearest', async () => {
    await writeFileAt(root, 'tsconfig.json', '{}');

    expect(groupByTsConfig(root, ['a.ts', 'src/b.ts']).get('')).toEqual(['a.ts', 'src/b.ts']);
  });
});
