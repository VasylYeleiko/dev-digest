import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalSecretsProvider } from '../src/adapters/secrets/local.js';
import { stripCredentials } from '../src/adapters/git/simple-git.js';

describe('LocalSecretsProvider', () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('ignores non-string values from a hand-edited file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'secrets-'));
    const file = join(dir, 'secrets.json');
    await writeFile(file, JSON.stringify({ GITHUB_TOKEN: 'ghp_x', OPENAI_API_KEY: 42 }));
    const s = new LocalSecretsProvider(file, {});
    expect(await s.get('GITHUB_TOKEN')).toBe('ghp_x');
    expect(await s.get('OPENAI_API_KEY')).toBeUndefined();
  });

  it.skipIf(process.platform === 'win32')('tightens a pre-existing loose file to 0600 on write', async () => {
    dir = await mkdtemp(join(tmpdir(), 'secrets-'));
    const file = join(dir, 'secrets.json');
    await writeFile(file, '{}', { mode: 0o644 });
    await new LocalSecretsProvider(file, {}).set('GITHUB_TOKEN', 'ghp_y');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ GITHUB_TOKEN: 'ghp_y' });
  });
});

describe('stripCredentials (git remotes never keep a token)', () => {
  it('drops user:password from an https URL', () => {
    expect(stripCredentials('https://x-access-token:ghp_secret@github.com/o/r.git')).toBe(
      'https://github.com/o/r.git',
    );
  });

  it('leaves clean https and scp-style SSH URLs unchanged', () => {
    expect(stripCredentials('https://github.com/o/r.git')).toBe('https://github.com/o/r.git');
    expect(stripCredentials('git@github.com:o/r.git')).toBe('git@github.com:o/r.git');
  });
});
