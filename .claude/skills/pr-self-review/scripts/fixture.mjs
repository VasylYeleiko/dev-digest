// Test helper: throwaway git repos with a `main` branch and a feature branch.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function run(root, ...args) {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'core.autocrlf=false', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function write(root, path, content) {
  const abs = join(root, path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** Creates a repo whose `main` holds `baseFiles`, checked out on branch `feat`. */
export function makeRepo(baseFiles = { 'README.md': 'base\n' }) {
  const root = mkdtempSync(join(tmpdir(), 'pr-self-review-'));
  run(root, 'init', '-q', '-b', 'main');
  run(root, 'config', 'core.autocrlf', 'false');
  for (const [p, c] of Object.entries(baseFiles)) write(root, p, c);
  run(root, 'add', '-A');
  run(root, 'commit', '-q', '-m', 'base');
  run(root, 'checkout', '-q', '-b', 'feat');
  return {
    root,
    write: (p, c) => write(root, p, c),
    git: (...args) => run(root, ...args),
    commitAll: (msg = 'wip') => {
      run(root, 'add', '-A');
      run(root, 'commit', '-q', '-m', msg);
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
