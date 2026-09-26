import type { SkillSource, SkillType } from '@devdigest/shared';

/**
 * skills — domain types (ring 1). Plain camelCase shapes; the repository maps
 * rows into these, helpers.ts maps them to the `Skill` / `SkillVersion` wire
 * contracts. The reviews module consumes the resolved-for-agent shape via
 * `skills/index.ts`.
 */

/** A skill = a reusable Markdown prompt block, versioned on every body change. */
export interface SkillEntity {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
  /** Body version; bumped (and snapshotted into skill_versions) only when `body` changes. */
  version: number;
  evidenceFiles: string[] | null;
  createdAt: Date;
}

/** An immutable body snapshot of one skill version. */
export interface SkillVersionEntity {
  skillId: string;
  version: number;
  body: string;
  createdAt: Date;
}

/**
 * Aggregated stats for a skill's Stats tab. `agents`/`usedBy` are real
 * (agent_skills join); `acceptRate`/`findings30d`/`findingsByCategory` are an
 * APPROXIMATION — aggregated across every agent using the skill, not
 * attributed to the skill's own contribution (no per-skill finding
 * attribution exists in this schema). See `repository.ts#statsForSkill`.
 */
export interface SkillStatsEntity {
  usedBy: number;
  agents: { id: string; name: string }[];
  /** decided = accepted or dismissed; null when there are zero decided findings. */
  acceptRate: number | null;
  findings30d: number | null;
  findingsByCategory: { category: string; count: number }[];
}
