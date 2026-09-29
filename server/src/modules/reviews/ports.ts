import type { Finding, Intent, RepoRef, RunSummary, RunTrace } from '@devdigest/shared';
import type {
  ActiveRun,
  AgentRunCompletion,
  FindingEntity,
  NewAgentRun,
  NewReview,
  ReviewEntity,
  ReviewWithFindings,
} from './types.js';

/**
 * reviews — ports (ring 1). `ReviewStore` is implemented by ReviewRepository
 * (Drizzle). `PrFilesRefresher` is what the diff loader needs from the pulls
 * module; composition wires PullService into it.
 */

export interface ReviewStore {
  // ---- reviews + findings -------------------------------------------------
  insertReview(values: NewReview): Promise<ReviewEntity>;
  insertFindings(reviewId: string, findings: Finding[]): Promise<FindingEntity[]>;
  /** Reviews for a PR (newest first), each with its findings. */
  reviewsForPull(prId: string): Promise<ReviewWithFindings[]>;
  /** Delete a whole review + its findings (cascade). False when not in the workspace. */
  deleteReview(workspaceId: string, reviewId: string): Promise<boolean>;

  // ---- finding actions ----------------------------------------------------
  /** The workspace owning a finding (via review → pr), or undefined if none. */
  findingWorkspaceId(findingId: string): Promise<string | undefined>;
  setFindingAccepted(findingId: string, at: Date | null): Promise<FindingEntity | undefined>;
  setFindingDismissed(findingId: string, at: Date | null): Promise<FindingEntity | undefined>;

  // ---- intent -------------------------------------------------------------
  upsertIntent(prId: string, intent: Intent): Promise<void>;
  getIntent(prId: string): Promise<Intent | undefined>;

  // ---- observability: agent_runs + run_traces -----------------------------
  /** Create an agent_runs row in `running` state; returns its id (= the runId). */
  createAgentRun(values: NewAgentRun): Promise<string>;
  completeAgentRun(runId: string, values: AgentRunCompletion): Promise<void>;
  /**
   * A finished run's result as one unit: insert the review + its findings and
   * complete the run. Either all of it is saved or none — a crash can't leave
   * a `failed` run whose review and findings are already persisted.
   */
  persistRunResult(
    runId: string,
    review: NewReview,
    findings: Finding[],
    completion: AgentRunCompletion,
  ): Promise<{ review: ReviewEntity; findings: FindingEntity[] }>;
  /** In-flight runs for a PR (status='running'), joined with the agent name. */
  activeRunsForPull(workspaceId: string, prId: string): Promise<ActiveRun[]>;
  /** All runs for a PR (any status), newest first — the PR run history. */
  listRunsForPull(workspaceId: string, prId: string): Promise<RunSummary[]>;
  /** Delete one run (+ its trace, + the review it produced). Workspace-scoped. */
  deleteAgentRun(workspaceId: string, runId: string): Promise<boolean>;
  /** A run's status ('running' | 'done' | …); undefined when no such run exists in the workspace. */
  runStatus(workspaceId: string, runId: string): Promise<string | null | undefined>;
  /** Mark a still-running run as cancelled (no-op if it already finished). */
  cancelRunIfRunning(runId: string): Promise<boolean>;
  /** On boot: mark every still-'running' run failed (its process is gone). */
  reapStaleRunningRuns(): Promise<number>;
  /** Persist the WHOLE run log as ONE document. PK = runId → agent_runs. */
  saveRunTrace(runId: string, trace: RunTrace): Promise<void>;
  getRunTrace(runId: string): Promise<RunTrace | undefined>;
}

/** Re-sync `pr_files` for a PR from GitHub. Best-effort: false on any failure. */
export interface PrFilesRefresher {
  refreshFiles(repo: RepoRef, pull: { id: string; number: number }): Promise<boolean>;
}
