import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { SourceFiles } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * Conventions routes end-to-end over real Postgres: the real repo-intel facade
 * ranks files from `file_rank`, the clone is an in-memory SourceFiles fake and
 * the model is a fixture. Covers persistence (survives a fresh app), triage,
 * and the re-scan contract: only `pending` is replaced, triaged rules never
 * come back.
 */

const DISK: Record<string, string> = {
  'tsconfig.json': '{\n  "compilerOptions": {\n    "strict": true\n  }\n}',
  'src/users.ts': [
    'export async function getUser(id: string) {',
    '  const user = await db.users.find(id);',
    '  return user;',
    '}',
  ].join('\n'),
  'src/errors.ts': "export class NotFoundError extends AppError {\n  constructor() { super('not_found'); }\n}",
};

const fakeFiles: SourceFiles = {
  read: async (_root, rel) => DISK[rel] ?? null,
  walk: async () => ({ files: Object.keys(DISK), stats: {} as never }),
};

const candidate = (rule: string, file: string, line: number, snippet: string, confidence: number) => ({
  rule,
  evidence: { file, line_start: line, line_end: line, snippet },
  category: 'other',
  confidence,
});

const REPLY = {
  conventions: [
    candidate('Keep TypeScript strict mode enabled.', 'tsconfig.json', 3, '"strict": true', 0.95),
    candidate('Use async/await for DB access.', 'src/users.ts', 2, 'const user = await db.users.find(id);', 0.8),
    candidate('Domain errors extend AppError.', 'src/errors.ts', 1, 'export class NotFoundError extends AppError {', 0.7),
    candidate('Invented rule with fake evidence.', 'src/users.ts', 9, 'return cache.get(id) ?? null;', 0.9),
  ],
};

d('conventions routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repoId: string;
  const llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: REPLY } });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: llm },
        sourceFiles: fakeFiles,
      },
    });
  }

  beforeAll(async () => {
    pg = await startPg();
    const { workspaceId } = await seed(pg.handle.db);
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
    repoId = repo!.id;
    await pg.handle.db.update(t.repos).set({ clonePath: '/clones/fake' }).where(eq(t.repos.id, repoId));
    await pg.handle.db.insert(t.fileRank).values(
      ['src/users.ts', 'src/errors.ts'].map((filePath, i) => ({
        repoId,
        filePath,
        pagerank: 1 - i / 10,
        hotness: 0,
        rank: 1 - i / 10,
        percentile: 90,
      })),
    );
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('extracts grounded candidates, persists them, and triage survives a fresh app', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.scan).toMatchObject({ proposed: 4, dropped: 1, skipped: 0, provider: 'openai' });
    expect(body.scan.sample_files).toEqual(['tsconfig.json', 'src/users.ts', 'src/errors.ts']);
    expect(body.items.map((c: { rule: string }) => c.rule)).toEqual([
      'Keep TypeScript strict mode enabled.',
      'Use async/await for DB access.',
      'Domain errors extend AppError.',
    ]);
    const strict = body.items[0];
    expect(strict).toMatchObject({
      status: 'pending',
      evidence_path: 'tsconfig.json',
      evidence_line_start: 3,
      evidence_snippet: '"strict": true',
      confidence: 0.95,
    });

    const [a, b] = body.items as { id: string }[];
    const reject = await app.inject({
      method: 'PATCH',
      url: `/conventions/${a!.id}`,
      payload: { status: 'rejected' },
    });
    expect(reject.statusCode).toBe(200);
    const edit = await app.inject({
      method: 'PATCH',
      url: `/conventions/${b!.id}`,
      payload: { status: 'accepted', rule: 'Always use async/await for DB access.', category: 'async' },
    });
    expect(edit.json()).toMatchObject({ status: 'accepted', rule: 'Always use async/await for DB access.', category: 'async' });
    await app.close();

    const fresh = await makeApp();
    const list = (await fresh.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    expect(list.items.map((c: { status: string }) => c.status).sort()).toEqual(['accepted', 'pending']);
    expect(list.items.some((c: { id: string }) => c.id === a!.id)).toBe(false);
    await fresh.close();
  });

  it('re-scan replaces only pending rows and never re-proposes a triaged rule', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const body = res.json();
    // strict-mode (rejected) is a dedupe hit; the edited accepted rule no longer
    // matches its old text, so the original wording comes back as pending once.
    expect(body.scan).toMatchObject({ proposed: 4, dropped: 1, skipped: 1 });

    const rows = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.repoId, repoId));
    const byStatus = (s: string) => rows.filter((r) => r.status === s).map((r) => r.rule).sort();
    expect(byStatus('rejected')).toEqual(['Keep TypeScript strict mode enabled.']);
    expect(byStatus('accepted')).toEqual(['Always use async/await for DB access.']);
    expect(byStatus('pending')).toEqual(['Domain errors extend AppError.', 'Use async/await for DB access.']);

    const scans = await pg.handle.db
      .select()
      .from(t.conventionScans)
      .where(and(eq(t.conventionScans.repoId, repoId)));
    expect(scans).toHaveLength(2);
    await app.close();
  });

  it('merges accepted rules into repo-conventions, links it once, and versions it on re-create', async () => {
    const app = await makeApp();
    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    const acceptedIds = list.items.filter((c: { status: string }) => c.status === 'accepted').map((c: { id: string }) => c.id);
    const pendingId = list.items.find((c: { status: string }) => c.status === 'pending').id;
    expect(acceptedIds).toHaveLength(1);

    const notAccepted = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill-draft`,
      payload: { convention_ids: [pendingId] },
    });
    expect(notAccepted.statusCode).toBe(422);

    const draft = (
      await app.inject({
        method: 'POST',
        url: `/repos/${repoId}/conventions/skill-draft`,
        payload: { convention_ids: acceptedIds },
      })
    ).json();
    expect(draft).toMatchObject({ name: 'repo-conventions', type: 'convention', existing_skill_id: null });
    expect(draft.body).toContain('### Always use async/await for DB access.');
    expect(draft.body).toContain('Evidence: `src/users.ts:2`');

    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json() as { id: string; name: string }[];
    const agent = agents.find((a) => a.name === 'General Reviewer')!;
    const create = (body: string) =>
      app.inject({
        method: 'POST',
        url: `/repos/${repoId}/conventions/skill`,
        payload: {
          name: draft.name,
          description: draft.description,
          type: draft.type,
          body,
          enabled: true,
          convention_ids: acceptedIds,
          agent_ids: [agent.id],
        },
      });

    const first = await create(draft.body);
    expect(first.statusCode).toBe(201);
    const skill = first.json().skill;
    expect(skill).toMatchObject({ name: 'repo-conventions', source: 'extracted', version: 1, evidence_files: ['src/users.ts'] });

    const skills = (await app.inject({ method: 'GET', url: '/skills' })).json() as { id: string }[];
    expect(skills.some((s) => s.id === skill.id)).toBe(true);
    const linksBefore = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    const linked = linksBefore.find((l: { skill_id: string }) => l.skill_id === skill.id);
    expect(linked).toBeDefined();

    const second = await create(`${draft.body}\nExtra line.\n`);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ created: false, skill: { id: skill.id, version: 2 } });
    const linksAfter = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    expect(linksAfter).toEqual(linksBefore);
    await app.close();
  });

  it('rejects bad input and unknown ids; a repo without a clone is a 409', async () => {
    const app = await makeApp();
    const empty = await app.inject({ method: 'PATCH', url: `/conventions/${repoId}`, payload: {} });
    expect(empty.statusCode).toBe(422);
    const badStatus = await app.inject({
      method: 'PATCH',
      url: `/conventions/${repoId}`,
      payload: { status: 'maybe' },
    });
    expect(badStatus.statusCode).toBe(422);
    const missing = await app.inject({
      method: 'PATCH',
      url: `/conventions/${repoId}`,
      payload: { status: 'accepted' },
    });
    expect(missing.statusCode).toBe(404);

    await pg.handle.db.update(t.repos).set({ clonePath: null }).where(eq(t.repos.id, repoId));
    const notCloned = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(notCloned.statusCode).toBe(409);
    await pg.handle.db.update(t.repos).set({ clonePath: '/clones/fake' }).where(eq(t.repos.id, repoId));
    await app.close();
  });
});
