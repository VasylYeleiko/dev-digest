/**
 * pulls — domain types (ring 1). Plain camelCase shapes; the repository maps
 * rows into these, the service maps them to the `PrMeta` / `PrDetail` wire
 * contracts.
 */

/** A pull request imported from GitHub (the `status` column is GitHub's merge state). */
export interface PullEntity {
  id: string;
  workspaceId: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  /** Head commit the latest review ran against (drives needs_review / stale). */
  lastReviewedSha: string | null;
  additions: number;
  deletions: number;
  filesCount: number;
  status: string;
  body: string | null;
  openedAt: Date | null;
  updatedAt: Date | null;
}

export interface PrFileEntity {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface PrCommitEntity {
  sha: string;
  message: string;
  author: string;
  committedAt: Date | null;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

/** A review's id + score, for the PR list's SCORE column. */
export interface ReviewScore {
  id: string;
  prId: string;
  score: number | null;
}

/** The finding fields the PR list's severity tally + preview popover read. */
export interface FindingPreview {
  reviewId: string;
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  startLine: number;
  confidence: number;
  rationale: string;
}

/** One successful run's cost, for the PR list's COST column. */
export interface RunCost {
  prId: string | null;
  costUsd: number | null;
}
