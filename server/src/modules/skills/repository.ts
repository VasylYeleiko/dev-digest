import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db, DbTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import { isBodyChange } from './helpers.js';
import type { InsertSkill, SkillStore, UpdateSkill } from './ports.js';
import type { SkillEntity, SkillStatsEntity, SkillVersionEntity } from './types.js';

/**
 * skills data-access (ring 3); implements `SkillStore`. Owns `skills` and
 * `skill_versions`; reads (but does not own) the `agent_skills` link table
 * (agents' repository owns writes to it — see `modules/agents/repository.ts`).
 * Workspace-scoped throughout. Rows have exactly the entity shapes.
 */
export class SkillsRepository implements SkillStore {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillEntity[]> {
    return this.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
  }

  async getById(workspaceId: string, id: string): Promise<SkillEntity | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Delete a skill (scoped to workspace). Versions + agent_skills links cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /**
   * Insert a skill AND record version 1 in skill_versions (immutable body
   * snapshot) — one transaction, so a skill never exists without its v1.
   */
  async insert(values: InsertSkill): Promise<SkillEntity> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: values.type,
          source: values.source ?? 'manual',
          body: values.body,
          enabled: values.enabled ?? true,
          version: INITIAL_SKILL_VERSION,
          evidenceFiles: values.evidenceFiles ?? null,
        })
        .returning();
      await this.snapshotVersion(tx, row!, INITIAL_SKILL_VERSION);
      return row!;
    });
  }

  /**
   * Update a skill. A BODY change (and only a body change) bumps the version
   * and snapshots the new body into skill_versions. Read → decide → write runs
   * in one transaction with the skill row locked (`FOR UPDATE`), so two
   * concurrent PUTs can't both read version N and both write N+1.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillEntity | undefined> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!existing) return undefined;

      const bodyChanged = isBodyChange(existing, patch);
      const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.source !== undefined ? { source: patch.source } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(patch.evidenceFiles !== undefined ? { evidenceFiles: patch.evidenceFiles } : {}),
          ...(bodyChanged ? { version: nextVersion } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();

      if (bodyChanged && row) await this.snapshotVersion(tx, row, nextVersion);
      return row;
    });
  }

  private async snapshotVersion(tx: DbTx, row: SkillEntity, version: number): Promise<void> {
    await tx
      .insert(t.skillVersions)
      .values({ skillId: row.id, version, body: row.body })
      .onConflictDoNothing();
  }

  // ---- skill_versions (immutable body snapshots) ---------------------------

  /** All body snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionEntity[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** A single body snapshot, or undefined if that version was never recorded. */
  async getVersion(skillId: string, version: number): Promise<SkillVersionEntity | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  // ---- consumed by the reviews module ---------------------------------------

  /** Enabled skills linked to an agent, in `order` ascending. */
  async resolveForAgent(agentId: string): Promise<{ name: string; body: string }[]> {
    const rows = await this.db
      .select({ name: t.skills.name, body: t.skills.body })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.enabled, true)))
      .orderBy(asc(t.agentSkills.order));
    return rows;
  }

  /**
   * Aggregated Stats-tab data for one skill (workspace-scoped via the linked
   * agents' `workspace_id`, since `agent_skills` carries no workspace of its
   * own).
   *
   * Definition (no prior art for "skill stats" in this codebase — documenting
   * the choice made here): used-by = agents in THIS workspace linking the
   * skill. The rest is an APPROXIMATION aggregated across those agents' own
   * reviews/findings (findings carry no skill attribution, so there is no way
   * to isolate this skill's own contribution):
   *   - findings_30d = count of findings whose review was created in the last
   *     30 days.
   *   - accept_rate = accepted / decided (accepted OR dismissed) findings,
   *     across ALL time — null when there are zero decided findings (never
   *     divide by zero / report a misleading 0%).
   *   - findings_by_category = a full-time group-by count per category.
   *
   * Two queries total (agents, then findings+reviews for those agents) —
   * no per-agent loop, so this does not N+1 with the number of using agents.
   */
  async statsForSkill(workspaceId: string, skillId: string): Promise<SkillStatsEntity> {
    const agentRows = await this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)));

    if (agentRows.length === 0) {
      return { usedBy: 0, agents: [], acceptRate: null, findings30d: null, findingsByCategory: [] };
    }
    const agentIds = agentRows.map((a) => a.id);

    const findingRows = await this.db
      .select({
        category: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
        reviewCreatedAt: t.reviews.createdAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(inArray(t.reviews.agentId, agentIds));

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let findings30d = 0;
    let accepted = 0;
    let decided = 0;
    const byCategory = new Map<string, number>();

    for (const f of findingRows) {
      byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1);
      if (f.reviewCreatedAt >= thirtyDaysAgo) findings30d++;
      if (f.acceptedAt || f.dismissedAt) {
        decided++;
        if (f.acceptedAt) accepted++;
      }
    }

    return {
      usedBy: agentRows.length,
      agents: agentRows,
      acceptRate: decided > 0 ? accepted / decided : null,
      findings30d,
      findingsByCategory: Array.from(byCategory.entries()).map(([category, count]) => ({
        category,
        count,
      })),
    };
  }
}
