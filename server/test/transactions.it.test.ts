import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Finding } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { PullRepository } from '../src/modules/pulls/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * Repository-level atomicity: each multi-statement write is all-or-nothing and
 * safe under concurrency. These run against real Postgres because the
 * guarantees (transactions, row locks, advisory locks) live in the database.
 */
d('repository transactions (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [pr] = await pg.handle.db.select().from(t.pullRequests).limit(1);
    workspaceId = pr!.workspaceId;
    prId = pr!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('concurrent config edits each get their own agent version (no lost bump)', async () => {
    const repo = new AgentsRepository(pg.handle.db);
    const agent = await repo.insert({
      workspaceId,
      name: 'Concurrent Agent',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'v1',
    });

    const edits = 5;
    await Promise.all(
      Array.from({ length: edits }, (_, i) =>
        repo.update(workspaceId, agent.id, { systemPrompt: `edit ${i}` }),
      ),
    );

    const final = await repo.getById(workspaceId, agent.id);
    expect(final!.version).toBe(1 + edits);
    const versions = await repo.listVersions(agent.id);
    expect(versions.map((v) => v.version).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('persistRunResult rolls back the review when a finding fails to insert', async () => {
    const reviews = new ReviewRepository(pg.handle.db);
    const runId = await reviews.createAgentRun({
      workspaceId,
      agentId: null,
      prId,
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    const broken = { file: null, severity: 'WARNING' } as unknown as Finding; // NOT NULL violation

    await expect(
      reviews.persistRunResult(
        runId,
        {
          workspaceId,
          prId,
          agentId: null,
          runId,
          kind: 'review',
          verdict: 'comment',
          summary: 's',
          score: 50,
          model: 'gpt-4o-mini',
        },
        [broken],
        {
          status: 'done',
          durationMs: 1,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: null,
          findingsCount: 1,
          grounding: '1/1 passed',
          error: null,
        },
      ),
    ).rejects.toThrow();

    const orphanReviews = await pg.handle.db
      .select()
      .from(t.reviews)
      .where(eq(t.reviews.runId, runId));
    expect(orphanReviews).toHaveLength(0);
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('running');
  });

  it('concurrent replaceFiles for one PR never duplicate rows', async () => {
    const pulls = new PullRepository(pg.handle.db);
    const files = ['a.ts', 'b.ts', 'c.ts'].map((path) => ({
      path,
      additions: 1,
      deletions: 0,
      patch: null,
    }));

    await Promise.all(Array.from({ length: 4 }, () => pulls.replaceFiles(prId, files)));

    const rows = await pulls.listFiles(prId);
    expect(rows.map((r) => r.path).sort()).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });
});
