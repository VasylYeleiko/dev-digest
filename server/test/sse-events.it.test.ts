import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/** Resolve the inject, or fail loudly instead of hanging the whole suite. */
function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`still open after ${ms}ms`)), ms)),
  ]);
}

/**
 * `/runs/:id/events` must END for a run this process holds no live state for —
 * before the fix it waited forever for a `done` that the bus would never emit.
 */
d('GET /runs/:id/events terminates (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  it('an unknown run id closes the stream immediately', async () => {
    const app = await makeApp();
    const res = await within(app.inject({ method: 'GET', url: `/runs/${randomUUID()}/events` }), 5000);
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('a run that finished in an earlier process closes the stream immediately', async () => {
    const [pr] = await pg.handle.db.select().from(t.pullRequests).limit(1);
    const reviews = new ReviewRepository(pg.handle.db);
    const runId = await reviews.createAgentRun({
      workspaceId: pr!.workspaceId,
      agentId: null,
      prId: pr!.id,
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    await reviews.completeAgentRun(runId, {
      status: 'failed',
      durationMs: 1,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: null,
      findingsCount: 0,
      grounding: '0/0 passed',
      error: 'reaped on boot',
    });

    const app = await makeApp(); // the run bus never saw this run (DB-only, like after a restart)
    const res = await within(app.inject({ method: 'GET', url: `/runs/${runId}/events` }), 5000);
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("another workspace's run can't be cancelled, traced or streamed", async () => {
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId: other!.id, status: 'running', source: 'local' })
      .returning();
    const runId = run!.id;

    const app = await makeApp();
    const cancel = await app.inject({ method: 'POST', url: `/runs/${runId}/cancel` });
    expect(cancel.json()).toEqual({ ok: false });
    const trace = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
    expect(trace.statusCode).toBe(404);
    const events = await within(app.inject({ method: 'GET', url: `/runs/${runId}/events` }), 5000);
    expect(events.statusCode).toBe(200);
    await app.close();

    // The foreign cancel did not touch it. (It reads 'failed', not 'running':
    // buildApp reaps every 'running' row on boot.)
    const [after] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(after!.status).not.toBe('cancelled');
  });
});
