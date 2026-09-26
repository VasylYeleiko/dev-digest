import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * SkillsRepository — real Postgres via testcontainers. Covers the three
 * things that need a real transaction/row-lock/aggregate query to verify:
 * the version-bump-on-body-change rule, `resolveForAgent`'s order + enabled
 * filter (consumed by the review run executor), and `statsForSkill`'s
 * aggregation across the agents that use a skill.
 */
d('SkillsRepository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  describe('update — version bump only on body change', () => {
    it('a fresh skill has exactly one version snapshot (v1)', async () => {
      const repo = new SkillsRepository(pg.handle.db);
      const skill = await repo.insert({
        workspaceId,
        name: 'v1-only',
        description: 'd',
        type: 'convention',
        body: 'v1 body',
      });
      expect(skill.version).toBe(1);
      const versions = await repo.listVersions(skill.id);
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({ version: 1, body: 'v1 body' });
    });

    it('a metadata-only update (name/description/type/enabled) does NOT bump the version', async () => {
      const repo = new SkillsRepository(pg.handle.db);
      const skill = await repo.insert({
        workspaceId,
        name: 'metadata-only',
        description: 'd',
        type: 'convention',
        body: 'same body',
      });

      const updated = await repo.update(workspaceId, skill.id, {
        name: 'renamed',
        description: 'new description',
        type: 'rubric',
        enabled: false,
      });
      expect(updated!.version).toBe(1);
      expect(updated!.name).toBe('renamed');
      expect(updated!.enabled).toBe(false);

      const versions = await repo.listVersions(skill.id);
      expect(versions).toHaveLength(1);
    });

    it('a patch with the SAME body text does not bump the version', async () => {
      const repo = new SkillsRepository(pg.handle.db);
      const skill = await repo.insert({
        workspaceId,
        name: 'same-body',
        description: 'd',
        type: 'convention',
        body: 'identical',
      });
      const updated = await repo.update(workspaceId, skill.id, { body: 'identical' });
      expect(updated!.version).toBe(1);
      expect(await repo.listVersions(skill.id)).toHaveLength(1);
    });

    it('a body change bumps the version and snapshots it; list is newest-first', async () => {
      const repo = new SkillsRepository(pg.handle.db);
      const skill = await repo.insert({
        workspaceId,
        name: 'body-change',
        description: 'd',
        type: 'convention',
        body: 'v1 body',
      });

      const updated = await repo.update(workspaceId, skill.id, { body: 'v2 body' });
      expect(updated!.version).toBe(2);

      const versions = await repo.listVersions(skill.id);
      expect(versions.map((v) => v.version)).toEqual([2, 1]);
      expect(versions[0]!.body).toBe('v2 body');
      expect(versions[1]!.body).toBe('v1 body');

      const v1 = await repo.getVersion(skill.id, 1);
      expect(v1!.body).toBe('v1 body');
    });

    it('concurrent body-changing updates each get their own version (row-locked)', async () => {
      const repo = new SkillsRepository(pg.handle.db);
      const skill = await repo.insert({
        workspaceId,
        name: 'concurrent-body',
        description: 'd',
        type: 'convention',
        body: 'v1',
      });

      const edits = 5;
      await Promise.all(
        Array.from({ length: edits }, (_, i) =>
          repo.update(workspaceId, skill.id, { body: `edit ${i}` }),
        ),
      );

      const final = await repo.getById(workspaceId, skill.id);
      expect(final!.version).toBe(1 + edits);
      const versions = await repo.listVersions(skill.id);
      expect(versions.map((v) => v.version).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  describe('resolveForAgent', () => {
    it('returns only ENABLED linked skills, ordered by `order` ascending', async () => {
      const skills = new SkillsRepository(pg.handle.db);
      const agents = new AgentsRepository(pg.handle.db);

      const agent = await agents.insert({
        workspaceId,
        name: 'Resolve Test Agent',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'review',
      });

      const first = await skills.insert({
        workspaceId,
        name: 'first-skill',
        description: 'd',
        type: 'convention',
        body: 'FIRST BODY',
      });
      const disabled = await skills.insert({
        workspaceId,
        name: 'disabled-skill',
        description: 'd',
        type: 'convention',
        body: 'DISABLED BODY',
        enabled: false,
      });
      const second = await skills.insert({
        workspaceId,
        name: 'second-skill',
        description: 'd',
        type: 'convention',
        body: 'SECOND BODY',
      });

      // Link out of name order to prove `order` (not insertion/name order) governs.
      await agents.linkSkill(agent.id, second.id, 0);
      await agents.linkSkill(agent.id, disabled.id, 1);
      await agents.linkSkill(agent.id, first.id, 2);

      const resolved = await skills.resolveForAgent(agent.id);
      expect(resolved).toEqual([
        { name: 'second-skill', body: 'SECOND BODY' },
        { name: 'first-skill', body: 'FIRST BODY' },
      ]);
    });

    it('returns [] for an agent with no linked skills', async () => {
      const skills = new SkillsRepository(pg.handle.db);
      const agents = new AgentsRepository(pg.handle.db);
      const agent = await agents.insert({
        workspaceId,
        name: 'No Skills Agent',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'review',
      });
      expect(await skills.resolveForAgent(agent.id)).toEqual([]);
    });
  });

  describe('statsForSkill', () => {
    it('used-by count + agent list + findings aggregates across the using agents', async () => {
      const skillsRepo = new SkillsRepository(pg.handle.db);
      const agentsRepo = new AgentsRepository(pg.handle.db);

      const skill = await skillsRepo.insert({
        workspaceId,
        name: 'stats-skill',
        description: 'd',
        type: 'rubric',
        body: 'body',
      });

      const agentA = await agentsRepo.insert({
        workspaceId,
        name: 'Stats Agent A',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'review',
      });
      const agentB = await agentsRepo.insert({
        workspaceId,
        name: 'Stats Agent B',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'review',
      });
      await agentsRepo.linkSkill(agentA.id, skill.id, 0);
      await agentsRepo.linkSkill(agentB.id, skill.id, 0);

      // A PR to hang reviews off (reviews.prId is NOT NULL).
      const [repo] = await pg.handle.db
        .select()
        .from(t.repos)
        .where(eq(t.repos.workspaceId, workspaceId))
        .limit(1);
      const [pr] = await pg.handle.db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId: repo!.id,
          number: 99001,
          title: 'stats test pr',
          author: 'tester',
          branch: 'x',
          base: 'main',
          headSha: 'deadbeef',
        })
        .returning();

      const recent = new Date();
      const old = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000); // 45 days ago

      const [reviewA] = await pg.handle.db
        .insert(t.reviews)
        .values({ workspaceId, prId: pr!.id, agentId: agentA.id, kind: 'review', createdAt: recent })
        .returning();
      const [reviewB] = await pg.handle.db
        .insert(t.reviews)
        .values({ workspaceId, prId: pr!.id, agentId: agentB.id, kind: 'review', createdAt: old })
        .returning();
      // A review from an unrelated agent must NOT leak into this skill's stats.
      const unrelatedAgent = await agentsRepo.insert({
        workspaceId,
        name: 'Unrelated Agent',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'review',
      });
      const [reviewUnrelated] = await pg.handle.db
        .insert(t.reviews)
        .values({ workspaceId, prId: pr!.id, agentId: unrelatedAgent.id, kind: 'review', createdAt: recent })
        .returning();

      const findingBase = {
        file: 'a.ts',
        startLine: 1,
        endLine: 1,
        severity: 'WARNING',
        confidence: 0.9,
      };
      await pg.handle.db.insert(t.findings).values([
        // recent review (agentA): 1 accepted testing, 1 dismissed perf
        {
          ...findingBase,
          reviewId: reviewA!.id,
          category: 'testing',
          title: 'accepted finding',
          rationale: 'r',
          acceptedAt: new Date(),
        },
        {
          ...findingBase,
          reviewId: reviewA!.id,
          category: 'perf',
          title: 'dismissed finding',
          rationale: 'r',
          dismissedAt: new Date(),
        },
        // old review (agentB, 45 days ago): 1 undecided testing finding
        {
          ...findingBase,
          reviewId: reviewB!.id,
          category: 'testing',
          title: 'undecided old finding',
          rationale: 'r',
        },
        // unrelated agent's review — must not count toward this skill's stats
        {
          ...findingBase,
          reviewId: reviewUnrelated!.id,
          category: 'security',
          title: 'unrelated finding',
          rationale: 'r',
          acceptedAt: new Date(),
        },
      ]);

      const stats = await skillsRepo.statsForSkill(workspaceId, skill.id);

      expect(stats.usedBy).toBe(2);
      expect(stats.agents.map((a) => a.id).sort()).toEqual([agentA.id, agentB.id].sort());
      // 3 findings total across agentA+agentB reviews; 1 within the last 30 days
      // window (the accepted+dismissed pair on the recent review). The old
      // review's finding is 45 days old and excluded from findings_30d.
      expect(stats.findings30d).toBe(2);
      // decided = accepted(1) + dismissed(1) = 2; accepted = 1 → 0.5
      expect(stats.acceptRate).toBe(0.5);
      const byCategory = Object.fromEntries(stats.findingsByCategory.map((c) => [c.category, c.count]));
      expect(byCategory.testing).toBe(2);
      expect(byCategory.perf).toBe(1);
      expect(byCategory.security).toBeUndefined();
    });

    it('a skill used by no agent in this workspace → zero/null, not an error', async () => {
      const skillsRepo = new SkillsRepository(pg.handle.db);
      const skill = await skillsRepo.insert({
        workspaceId,
        name: 'unused-skill',
        description: 'd',
        type: 'rubric',
        body: 'body',
      });
      const stats = await skillsRepo.statsForSkill(workspaceId, skill.id);
      expect(stats).toEqual({
        usedBy: 0,
        agents: [],
        acceptRate: null,
        findings30d: null,
        findingsByCategory: [],
      });
    });
  });
});
