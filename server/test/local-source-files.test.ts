/**
 * LocalSourceFiles.read — confinement to the clone. A cloned repo controls its
 * own symlinks and `relPath` can come from a diff, so a read must never reach
 * a host file outside the clone (whatever is read can end up in a prompt).
 * Directory links use a `junction`, which Windows allows without admin rights.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalSourceFiles } from '../src/adapters/fs/local-source-files.js';

describe('LocalSourceFiles.read', () => {
  let sandbox: string;
  let root: string;
  const files = new LocalSourceFiles();

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'source-files-'));
    root = join(sandbox, 'clone');
    await mkdir(join(root, 'src'), { recursive: true });
    await mkdir(join(sandbox, 'host'));
    await writeFile(join(root, 'src', 'a.ts'), 'export const a = 1;');
    await writeFile(join(sandbox, 'host', 'secrets.json'), '{"token":"s3cret"}');
    await symlink(join(sandbox, 'host'), join(root, 'escape'), 'junction');
    await symlink(join(root, 'src'), join(root, 'alias'), 'junction');
  });
  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it('reads files inside the clone, also through a link that stays inside it', async () => {
    expect(await files.read(root, 'src/a.ts')).toBe('export const a = 1;');
    expect(await files.read(root, 'alias/a.ts')).toBe('export const a = 1;');
  });

  it('refuses a path that resolves outside the clone — via a link or via ../', async () => {
    expect(await files.read(root, 'escape/secrets.json')).toBeNull();
    expect(await files.read(root, '../host/secrets.json')).toBeNull();
    expect(await files.read(root, 'src/missing.ts')).toBeNull();
  });
});
