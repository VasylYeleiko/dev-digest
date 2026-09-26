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
import { DepCruiseGraph, toRepoRel } from '../src/adapters/depgraph/index.js';

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
});
