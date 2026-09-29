import type {
  ConventionCategory,
  ConventionStatus,
  FeatureModelChoice,
  Skill,
  SkillSource,
  SkillType,
  SourceFiles,
} from '@devdigest/shared';
import type { RepoStore } from '../repos/index.js';
import type { RepoIntel } from '../repo-intel/index.js';
import type { ConventionEntity, ConventionScanEntity } from './types.js';

/**
 * conventions — ports (ring 1). The persistence port is implemented by
 * ConventionsRepository; the rest are narrow slices of other modules and
 * shared adapters, wired in `compose.ts`.
 */

/** A candidate that passed the evidence gate, ready to persist as `pending`. */
export interface NewConvention {
  category: ConventionCategory;
  rule: string;
  evidencePath: string;
  evidenceLineStart: number;
  evidenceLineEnd: number;
  evidenceSnippet: string;
  confidence: number | null;
}

export interface NewConventionScan {
  provider: string;
  model: string;
  sampleFiles: string[];
  proposed: number;
  dropped: number;
  skipped: number;
  costUsd: number | null;
}

export interface ConventionPatch {
  status?: ConventionStatus;
  rule?: string;
  category?: ConventionCategory;
}

export interface ConventionStore {
  /** `pending` + `accepted` rows of a repo — rejected ones are never listed. */
  listVisible(workspaceId: string, repoId: string): Promise<ConventionEntity[]>;
  /** Rule texts already triaged (accepted or rejected) — the re-scan dedupe set. */
  triagedRules(workspaceId: string, repoId: string): Promise<string[]>;
  latestScan(workspaceId: string, repoId: string): Promise<ConventionScanEntity | undefined>;
  /**
   * One unit of work, serialized per repo: drop the repo's `pending` rows,
   * insert the new candidates as `pending`, record the scan.
   */
  replacePending(
    workspaceId: string,
    repoId: string,
    rows: NewConvention[],
    scan: NewConventionScan,
  ): Promise<void>;
  /** Triage / inline edit. Undefined when the row isn't in this workspace. */
  update(workspaceId: string, id: string, patch: ConventionPatch): Promise<ConventionEntity | undefined>;
  /** The `accepted` rows of a repo among `ids`, in list order (unknown/other-status ids omitted). */
  acceptedByIds(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionEntity[]>;
}

/** What the skill writer needs to create/update the merged skill. */
export interface ConventionSkillWrite {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
  source?: SkillSource;
  evidenceFiles?: string[] | null;
}

/** Slice of the skills module (SkillsService satisfies it structurally). */
export interface ConventionSkillWriter {
  findByName(workspaceId: string, name: string): Promise<Skill | undefined>;
  create(workspaceId: string, input: ConventionSkillWrite): Promise<Skill>;
  update(
    workspaceId: string,
    id: string,
    patch: Partial<ConventionSkillWrite>,
  ): Promise<Skill | undefined>;
}

/**
 * Slice of the agents module (AgentsService satisfies it structurally).
 * `linkSkill` keeps its own rules (e.g. no attaching a disabled skill).
 */
export interface ConventionAgentLinker {
  get(workspaceId: string, id: string): Promise<{ id: string } | undefined>;
  skillLinks(workspaceId: string, agentId: string): Promise<{ skill_id: string }[] | undefined>;
  linkSkill(workspaceId: string, agentId: string, skillId: string): Promise<unknown>;
}

/** Workspace-scoped repo lookup (clone path + display name). */
export type ConventionRepoLookup = Pick<RepoStore, 'getById'>;

/** Ranked, junk-filtered source sample from the repo-intel index. */
export type ConventionSampler = Pick<RepoIntel, 'getConventionSamples'>;

/** Read-only access to the local clone. */
export type ConventionFileReader = Pick<SourceFiles, 'read'>;

/** Provider + model for the `conventions` feature (workspace override or default). */
export type FeatureModelResolver = (workspaceId: string) => Promise<FeatureModelChoice>;

/** The PROPOSE call's system prompt (kept as an editable template file). */
export type SystemPromptLoader = () => Promise<string>;
