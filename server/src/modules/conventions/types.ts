import type { ConventionCategory, ConventionStatus } from '@devdigest/shared';

/**
 * conventions — domain types (ring 1). Plain camelCase shapes; the repository
 * maps rows into these, helpers.ts maps them to the wire contracts.
 */

/** One extracted house-rule, grounded in a file + line range. */
export interface ConventionEntity {
  id: string;
  workspaceId: string;
  repoId: string | null;
  category: ConventionCategory;
  rule: string;
  evidencePath: string | null;
  evidenceLineStart: number | null;
  evidenceLineEnd: number | null;
  evidenceSnippet: string | null;
  confidence: number | null;
  status: ConventionStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** One extraction run (page header + evidence-gate stats). */
export interface ConventionScanEntity {
  id: string;
  workspaceId: string;
  repoId: string;
  provider: string;
  model: string;
  sampleFiles: string[];
  proposed: number;
  dropped: number;
  skipped: number;
  costUsd: number | null;
  createdAt: Date;
}

/** A file shown to the model, keyed by repo-relative path. */
export interface SampledFile {
  path: string;
  kind: 'config' | 'source';
  content: string;
}

/** Evidence after the code gate: real line range + snippet sliced from the file. */
export interface VerifiedEvidence {
  path: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  /** True when the model's line numbers were off and got corrected. */
  corrected: boolean;
}

/** Why the evidence gate threw a candidate away. */
export type EvidenceRejection =
  | 'file_not_sampled'
  | 'empty_snippet'
  | 'trivial_snippet'
  | 'snippet_not_found';

export type EvidenceCheck =
  | { ok: true; evidence: VerifiedEvidence }
  | { ok: false; reason: EvidenceRejection };
