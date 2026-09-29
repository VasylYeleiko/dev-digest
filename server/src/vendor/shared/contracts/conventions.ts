import { z } from 'zod';
import { Skill, SkillType } from './knowledge.js';

/**
 * Conventions Extractor contracts (Skills Lab → Conventions).
 *
 * NEW file — supersedes the unused `ConventionCandidate` in knowledge.ts, which
 * predates the triage flow (it only knew `accepted: boolean`). Covers:
 *   GET    /repos/:id/conventions                → ConventionsResponse
 *   POST   /repos/:id/conventions/extract        → ConventionsResponse
 *   PATCH  /conventions/:id                      → Convention
 *   POST   /repos/:id/conventions/skill-draft    → ConventionSkillDraft
 *   POST   /repos/:id/conventions/skill          → CreateConventionsSkillResult
 */

/** What a house-rule is about. Closed set so the UI can group/filter by it. */
export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'imports',
  'types',
  'error-handling',
  'async',
  'testing',
  'formatting',
  'api',
  'data-access',
  'other',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

/** Triage state. A re-scan only ever replaces `pending` rows. */
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

/** One extracted house-rule, grounded in a real file + line range. */
export const Convention = z.object({
  id: z.string(),
  repo_id: z.string().nullable(),
  category: ConventionCategory,
  rule: z.string(),
  evidence_path: z.string().nullable(),
  evidence_line_start: z.number().int().nullable(),
  evidence_line_end: z.number().int().nullable(),
  /** Sliced from the real file by the server — never the model's own text. */
  evidence_snippet: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  status: ConventionStatus,
  created_at: z.string(),
  updated_at: z.string(),
});
export type Convention = z.infer<typeof Convention>;

/** Bookkeeping for one extraction run (header line + evidence-gate stats). */
export const ConventionScan = z.object({
  id: z.string(),
  repo_id: z.string(),
  provider: z.string(),
  model: z.string(),
  /** Repo-relative paths that were shown to the model (configs + top-ranked files). */
  sample_files: z.array(z.string()),
  /** Candidates the model proposed. */
  proposed: z.number().int(),
  /** Dropped by the evidence gate (file/snippet not found in the sample). */
  dropped: z.number().int(),
  /** Skipped as duplicates of an already accepted/rejected rule. */
  skipped: z.number().int(),
  cost_usd: z.number().nullable(),
  created_at: z.string(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

/** GET /repos/:id/conventions and POST …/extract. Rejected rows are never listed. */
export const ConventionsResponse = z.object({
  scan: ConventionScan.nullable(),
  items: z.array(Convention),
});
export type ConventionsResponse = z.infer<typeof ConventionsResponse>;

/** PATCH /conventions/:id — triage and/or inline edit; at least one field. */
export const UpdateConventionRequest = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().trim().min(1).max(500).optional(),
    category: ConventionCategory.optional(),
  })
  .refine((b) => b.status !== undefined || b.rule !== undefined || b.category !== undefined, {
    message: 'Provide at least one of status, rule, category',
  });
export type UpdateConventionRequest = z.infer<typeof UpdateConventionRequest>;

/** POST /repos/:id/conventions/skill-draft body — which accepted rows to merge. */
export const ConventionSkillDraftRequest = z.object({
  convention_ids: z.array(z.string().uuid()).min(1),
});
export type ConventionSkillDraftRequest = z.infer<typeof ConventionSkillDraftRequest>;

/** Pre-filled, editable skill assembled from accepted conventions. Persists nothing. */
export const ConventionSkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  convention_ids: z.array(z.string()),
  /** Set when a skill with this name already exists — Create saves a new version of it. */
  existing_skill_id: z.string().nullable(),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;

/** POST /repos/:id/conventions/skill body — the (edited) draft + agents to link it to. */
export const CreateConventionsSkillRequest = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  type: SkillType,
  body: z.string().min(1),
  enabled: z.boolean(),
  convention_ids: z.array(z.string().uuid()).min(1),
  agent_ids: z.array(z.string().uuid()).max(50),
});
export type CreateConventionsSkillRequest = z.infer<typeof CreateConventionsSkillRequest>;

export const CreateConventionsSkillResult = z.object({
  skill: Skill,
  /** false when an existing skill got a new version instead. */
  created: z.boolean(),
  linked_agent_ids: z.array(z.string()),
});
export type CreateConventionsSkillResult = z.infer<typeof CreateConventionsSkillResult>;
