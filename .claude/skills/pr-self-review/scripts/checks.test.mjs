import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { checkLockfiles, checkMigrations, checkMissingTests, checkSecrets, checkSharedMirror, tail } from './checks.mjs';
import { write } from './fixture.mjs';

const f = (status, path, extra = {}) => ({ status, path, ...extra });
const checks = (list) => list.map((x) => `${x.severity} ${x.check}`);

describe('checkMigrations', () => {
  it('flags a schema change without a new migration', () => {
    assert.deepEqual(checks(checkMigrations([f('M', 'server/src/db/schema/pulls.ts')])), ['CRITICAL migration-drift']);
  });

  it('accepts a schema change with a descriptively named migration + journal update', () => {
    const out = checkMigrations([
      f('M', 'server/src/db/schema.ts'),
      f('A', 'server/src/db/migrations/0012_add_run_cost.sql'),
      f('A', 'server/src/db/migrations/meta/0012_snapshot.json'),
      f('M', 'server/src/db/migrations/meta/_journal.json'),
    ]);
    assert.deepEqual(out, []);
  });

  it('flags hand-edited or deleted existing migrations', () => {
    const out = checkMigrations([
      f('M', 'server/src/db/migrations/0003_minor_overlord.sql'),
      f('D', 'server/src/db/migrations/meta/0003_snapshot.json'),
    ]);
    assert.deepEqual(checks(out), ['CRITICAL migration-hand-edit', 'CRITICAL migration-hand-edit']);
  });

  it('warns on drizzle codename migrations', () => {
    const out = checkMigrations([f('M', 'server/src/db/schema.ts'), f('A', 'server/src/db/migrations/0012_fantastic_jane_foster.sql')]);
    assert.deepEqual(checks(out), ['WARNING migration-name']);
  });
});

describe('checkLockfiles', () => {
  it('flags a lock file change without package.json', () => {
    assert.deepEqual(checks(checkLockfiles([f('M', 'client/pnpm-lock.yaml')])), ['CRITICAL lockfile']);
    assert.deepEqual(checkLockfiles([f('M', 'client/pnpm-lock.yaml'), f('M', 'client/package.json')]), []);
    assert.deepEqual(checks(checkLockfiles([f('M', 'reviewer-core/package-lock.json'), f('M', 'server/package.json')])), ['CRITICAL lockfile']);
  });
});

describe('checkSecrets', () => {
  // assembled at runtime so this file never contains a token-shaped literal
  const ghToken = 'gh' + 'p_' + 'A1b2C3d4'.repeat(5);
  const openAiKey = 's' + 'k-proj-' + 'x'.repeat(30);

  it('flags tokens in added lines and never echoes them in full', () => {
    const added = new Map([
      ['server/src/a.ts', [{ line: 7, text: `const t = "${ghToken}";` }, { line: 9, text: `key: '${openAiKey}'` }]],
    ]);
    const out = checkSecrets([f('M', 'server/src/a.ts')], added);
    assert.deepEqual(out.map((x) => [x.severity, x.line]), [['CRITICAL', 7], ['CRITICAL', 9]]);
    for (const x of out) {
      assert.ok(!x.evidence.includes(ghToken) && !x.evidence.includes(openAiKey), 'secret leaked into evidence');
    }
  });

  it('ignores look-alikes and lock files', () => {
    const added = new Map([
      ['client/src/a.ts', [{ line: 1, text: 'const cls = "risk-assessment-panel-very-long-name";' }]],
      ['client/pnpm-lock.yaml', [{ line: 1, text: `integrity: ${ghToken}` }]],
    ]);
    assert.deepEqual(checkSecrets([f('M', 'client/src/a.ts'), f('M', 'client/pnpm-lock.yaml')], added), []);
  });

  it('flags committed .env files but not .env.example', () => {
    const out = checkSecrets([f('A', 'server/.env'), f('A', 'server/.env.example'), f('D', 'client/.env.local')], new Map());
    assert.deepEqual(out.map((x) => x.file), ['server/.env']);
  });
});

describe('tail', () => {
  it('strips ANSI colours and blank lines, keeps the last n lines', () => {
    assert.equal(tail('\x1b[31m FAIL \x1b[39m a\n\n  \nb\nc', 2), 'b\nc');
    assert.equal(tail('\x1b[31mred\x1b[39m'), 'red');
  });
});

describe('filesystem checks', () => {
  const root = mkdtempSync(join(tmpdir(), 'pr-self-review-checks-'));
  after(() => rmSync(root, { recursive: true, force: true }));

  it('checkSharedMirror: ignores CRLF-only differences, flags real drift and missing mirrors', () => {
    write(root, 'server/src/vendor/shared/contracts/a.ts', 'export const A = 1;\r\n');
    write(root, 'client/src/vendor/shared/contracts/a.ts', 'export const A = 1;\n');
    write(root, 'server/src/vendor/shared/contracts/b.ts', 'export const B = 2;\n');
    write(root, 'client/src/vendor/shared/contracts/b.ts', 'export const B = 1;\n');
    write(root, 'server/src/vendor/shared/contracts/c.ts', 'export const C = 1;\n');
    const out = checkSharedMirror(root, [
      f('M', 'server/src/vendor/shared/contracts/a.ts'),
      f('M', 'server/src/vendor/shared/contracts/b.ts'),
      f('A', 'server/src/vendor/shared/contracts/c.ts'),
    ]);
    assert.deepEqual(out.map((x) => `${x.rule} ${x.file}`), [
      'contract mirror drifted client/src/vendor/shared/contracts/b.ts',
      'contract not mirrored server/src/vendor/shared/contracts/c.ts',
    ]);
    assert.deepEqual(checkSharedMirror(root, [f('M', 'server/src/app.ts')]), [], 'untouched contracts are not checked');
  });

  it('checkMissingTests: server tests live in server/test/<module>*, client tests are colocated', () => {
    write(root, 'server/test/pulls-status.test.ts', '');
    write(root, 'client/src/app/x/_components/Card/Card.tsx', '');
    write(root, 'client/src/app/x/_components/Row/Row.tsx', '');
    write(root, 'client/src/app/x/_components/Row/Row.test.tsx', '');
    write(root, 'client/src/app/x/page.tsx', '');
    const out = checkMissingTests(root, [
      f('A', 'server/src/modules/pulls/service.ts'), // covered by server/test/pulls-status.test.ts
      f('A', 'server/src/modules/notes/repository.ts'), // no server/test/notes*.test.ts
      f('M', 'server/src/modules/notes/routes.ts'), // not new
      f('A', 'client/src/app/x/_components/Card/Card.tsx'),
      f('A', 'client/src/app/x/_components/Row/Row.tsx'),
      f('A', 'client/src/app/x/page.tsx'),
    ]);
    assert.deepEqual(out.map((x) => `${x.severity} ${x.file} ${x.evidence}`), [
      'WARNING server/src/modules/notes/repository.ts no server/test/notes*.test.ts',
      'WARNING client/src/app/x/_components/Card/Card.tsx no Card.test.ts(x) next to it',
    ]);
  });
});
