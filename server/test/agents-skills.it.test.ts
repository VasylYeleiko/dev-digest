import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-skills] Docker not available — skipping integration tests.');
}

/**
 * POST /agents/:id/skills — attaching a DISABLED skill. The UI (SkillsTab)
 * renders a disabled skill as unattachable, but the server enforces it too:
 * a skill that's already linked stays linked (detach/reorder still work)
 * even after it's disabled, but a disabled skill can never be freshly
 * attached, whether via the whole-set replace (`skill_ids`) or the single
 * link (`skill_id`) form.
 */
d('POST /agents/:id/skills — disabled skill attach', () => {
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

  async function makeAgent(app: Awaited<ReturnType<typeof makeApp>>) {
    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'Skill Attach Agent', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
    });
    return created.json().id as string;
  }

  async function makeSkill(app: Awaited<ReturnType<typeof makeApp>>, enabled: boolean) {
    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'Attach Test Skill', description: 'x', type: 'convention', body: '# x', enabled },
    });
    return created.json().id as string;
  }

  it('rejects attaching a disabled skill via skill_ids (whole-set replace)', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const skillId = await makeSkill(app, false);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skillId] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');

    const links = await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` });
    expect(links.json()).toEqual([]);
    await app.close();
  });

  it('rejects attaching a disabled skill via skill_id (link one)', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const skillId = await makeSkill(app, false);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_id: skillId },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('keeps an already-linked skill attached (detach/reorder allowed) after it is disabled', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const skillId = await makeSkill(app, true);

    // Attach while enabled.
    const attach = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skillId] },
    });
    expect(attach.statusCode).toBe(200);

    // Disable it from the Skills page.
    const disable = await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { enabled: false } });
    expect(disable.statusCode).toBe(200);

    // Re-sending the same set (a reorder no-op / keep) must still succeed.
    const keep = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skillId] },
    });
    expect(keep.statusCode).toBe(200);
    expect(keep.json()).toHaveLength(1);

    // Detaching (empty set) must still succeed.
    const detach = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [] },
    });
    expect(detach.statusCode).toBe(200);
    expect(detach.json()).toEqual([]);
    await app.close();
  });
});
