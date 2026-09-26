import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';

/**
 * agents — domain types (ring 1). Plain camelCase shapes; the repository maps
 * rows into these, helpers.ts maps them to the `Agent` / `AgentVersion` wire
 * contracts. The reviews module consumes `AgentEntity` via `agents/index.ts`.
 */

/** A review agent = provider + model + system prompt + review/CI policy. */
export interface AgentEntity {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema: unknown;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  /** Whether this agent's reviews get repo-intel context in the prompt. */
  repoIntel: boolean;
  enabled: boolean;
  /** Config version; bumped (and snapshotted) on every config change. */
  version: number;
  createdBy: string | null;
  createdAt: Date;
}

/** An immutable config snapshot of one agent version. */
export interface AgentVersionEntity {
  agentId: string;
  version: number;
  /** Untyped jsonb — validated by `AgentVersionConfig` on the way out. */
  configJson: unknown;
  createdAt: Date;
}

/** A skill linked to an agent, with its position in the agent's skill list. */
export interface LinkedSkill {
  skillId: string;
  order: number;
}
