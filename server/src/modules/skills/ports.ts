import type { SkillSource, SkillType } from '@devdigest/shared';
import type { SkillEntity, SkillStatsEntity, SkillVersionEntity } from './types.js';

/**
 * skills — persistence port (ring 1); implemented by SkillsRepository. Also
 * consumed by the reviews module (resolve an agent's linked skills for the
 * prompt) through `skills/index.ts`.
 */

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  source?: SkillSource;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

export interface SkillStore {
  list(workspaceId: string): Promise<SkillEntity[]>;
  getById(workspaceId: string, id: string): Promise<SkillEntity | undefined>;
  /** Delete (versions cascade; agent_skills links cascade). False when not in the workspace. */
  deleteById(workspaceId: string, id: string): Promise<boolean>;
  /** Insert a skill AND record version 1 (immutable body snapshot). */
  insert(values: InsertSkill): Promise<SkillEntity>;
  /** Update; a body change bumps the version and snapshots it. */
  update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillEntity | undefined>;

  /** All body snapshots for a skill, newest version first. */
  listVersions(skillId: string): Promise<SkillVersionEntity[]>;
  getVersion(skillId: string, version: number): Promise<SkillVersionEntity | undefined>;

  /**
   * Enabled skills linked to an agent, in `order` ascending — consumed by the
   * reviews run executor to build the prompt's Skills block. Minimal shape on
   * purpose: only what prompt assembly needs.
   */
  resolveForAgent(agentId: string): Promise<{ name: string; body: string }[]>;

  /** Aggregated Stats-tab data for one skill (workspace-scoped). */
  statsForSkill(workspaceId: string, skillId: string): Promise<SkillStatsEntity>;
}
