import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import type { AgentEntity, AgentVersionEntity, LinkedSkill, SkillAttachState } from './types.js';

/**
 * agents — persistence port (ring 1); implemented by AgentsRepository. Also
 * consumed by the reviews module (resolve which agents to run) through
 * `agents/index.ts`.
 */

export interface InsertAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateAgent {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
}

export interface AgentStore {
  list(workspaceId: string): Promise<AgentEntity[]>;
  listEnabled(workspaceId: string): Promise<AgentEntity[]>;
  getById(workspaceId: string, id: string): Promise<AgentEntity | undefined>;
  /** Delete (versions/skill-links cascade). False when not in the workspace. */
  deleteById(workspaceId: string, id: string): Promise<boolean>;
  /** Insert an agent AND record version 1 (immutable snapshot). */
  insert(values: InsertAgent): Promise<AgentEntity>;
  /** Update; a config change bumps the version and snapshots it. */
  update(workspaceId: string, id: string, patch: UpdateAgent): Promise<AgentEntity | undefined>;

  /** All config snapshots for an agent, newest version first. */
  listVersions(agentId: string): Promise<AgentVersionEntity[]>;
  getVersion(agentId: string, version: number): Promise<AgentVersionEntity | undefined>;

  /** Skills linked to an agent, in `order` ascending. */
  linkedSkills(agentId: string): Promise<LinkedSkill[]>;
  /** Linked-skill count per agent (absent ⇒ 0) — the card's "N skills". One grouped query. */
  skillCounts(workspaceId: string, agentIds: string[]): Promise<Map<string, number>>;
  /** Link a skill at a given order (idempotent: upserts order). */
  linkSkill(agentId: string, skillId: string, order: number): Promise<void>;
  unlinkSkill(agentId: string, skillId: string): Promise<void>;
  /** Replace the whole linked set, order = index. */
  setSkills(agentId: string, skillIds: string[]): Promise<void>;
  /** `enabled` + `body` of each of `skillIds` that belongs to `workspaceId` —
   *  what the service needs to refuse freshly attaching an unknown, foreign,
   *  disabled or injection-flagged skill, while still allowing one that's
   *  already linked to be kept/reordered/detached. Ids outside the workspace
   *  are simply absent from the result. */
  skillAttachState(workspaceId: string, skillIds: string[]): Promise<SkillAttachState[]>;
}
