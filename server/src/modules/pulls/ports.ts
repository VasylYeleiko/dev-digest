import type { PrMeta } from '@devdigest/shared';
import type {
  DiffStats,
  FindingPreview,
  PrCommitEntity,
  PrFileEntity,
  PullEntity,
  ReviewScore,
  RunCost,
} from './types.js';

/**
 * pulls — persistence port (ring 1); implemented by PullRepository. Also
 * consumed through `pulls/index.ts` by polling (PR-list sync) and reviews
 * (load the PR under review, its files, mark it reviewed).
 */
export interface PullStore {
  listByRepo(repoId: string): Promise<PullEntity[]>;
  getInWorkspace(workspaceId: string, id: string): Promise<PullEntity | undefined>;
  /**
   * Insert a PR from GitHub's list payload, or refresh title/head/status/updated
   * on the existing row. Idempotent on (repo, number).
   */
  upsertFromGitHub(workspaceId: string, repoId: string, pr: PrMeta): Promise<void>;
  updateDiffStats(id: string, stats: DiffStats): Promise<void>;
  /**
   * Record the head commit a review just ran against, so the PR list can
   * derive reviewed / needs_review (head moved) / stale.
   */
  markReviewed(id: string, sha: string): Promise<void>;
  /** Refresh body + diff stats from a PR-detail fetch. */
  updateDetail(id: string, detail: DiffStats & { body: string | null }): Promise<void>;

  listFiles(prId: string): Promise<PrFileEntity[]>;
  /** Replace every `pr_files` row of a PR (delete, then insert `files` if any). */
  replaceFiles(prId: string, files: PrFileEntity[]): Promise<void>;
  listCommits(prId: string): Promise<PrCommitEntity[]>;
  /** Replace every `pr_commits` row of a PR (delete, then insert `commits` if any). */
  replaceCommits(prId: string, commits: PrCommitEntity[]): Promise<void>;

  // ---- PR-list read model (reviews / findings / runs, read-only) ----------
  /** `kind='review'` reviews of these PRs, newest first. */
  reviewScores(prIds: string[]): Promise<ReviewScore[]>;
  findingPreviews(reviewIds: string[]): Promise<FindingPreview[]>;
  /** Cost of every `done` run of these PRs in the workspace. */
  successfulRunCosts(workspaceId: string, prIds: string[]): Promise<RunCost[]>;
}
