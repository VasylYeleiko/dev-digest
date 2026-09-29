import type { Finding, Intent, RunSummary, RunTrace } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import type { ReviewStore } from './ports.js';
import type {
  ActiveRun,
  AgentRunCompletion,
  FindingEntity,
  NewAgentRun,
  NewReview,
  ReviewEntity,
  ReviewWithFindings,
} from './types.js';
import * as reviewRepo from './repository/review.repo.js';
import * as runRepo from './repository/run.repo.js';
import * as intentRepo from './repository/intent.repo.js';

/**
 * A2 — review data-access (ring 3); implements `ReviewStore`. Owns `reviews`,
 * `findings`, `pr_intent`, and the observability rows `agent_runs` +
 * `run_traces` (one trace doc per run). Workspace scoping is enforced via the
 * PR (which carries workspace_id).
 *
 * The query implementations are colocated, split by aggregate, under
 * `./repository/` (review+findings, agent runs, intent); this class composes them.
 */
export class ReviewRepository implements ReviewStore {
  constructor(private db: Db) {}

  // ---- reviews + findings -------------------------------------------------

  insertReview(values: NewReview): Promise<ReviewEntity> {
    return reviewRepo.insertReview(this.db, values);
  }

  insertFindings(reviewId: string, findings: Finding[]): Promise<FindingEntity[]> {
    return reviewRepo.insertFindings(this.db, reviewId, findings);
  }

  reviewsForPull(prId: string): Promise<ReviewWithFindings[]> {
    return reviewRepo.reviewsForPull(this.db, prId);
  }

  deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return reviewRepo.deleteReview(this.db, workspaceId, reviewId);
  }

  // ---- finding actions ----------------------------------------------------

  findingWorkspaceId(findingId: string): Promise<string | undefined> {
    return reviewRepo.findingWorkspaceId(this.db, findingId);
  }

  setFindingAccepted(findingId: string, at: Date | null): Promise<FindingEntity | undefined> {
    return reviewRepo.setFindingAccepted(this.db, findingId, at);
  }

  setFindingDismissed(findingId: string, at: Date | null): Promise<FindingEntity | undefined> {
    return reviewRepo.setFindingDismissed(this.db, findingId, at);
  }

  // ---- intent -------------------------------------------------------------

  upsertIntent(prId: string, intent: Intent): Promise<void> {
    return intentRepo.upsertIntent(this.db, prId, intent);
  }

  getIntent(prId: string): Promise<Intent | undefined> {
    return intentRepo.getIntent(this.db, prId);
  }

  // ---- observability: agent_runs + run_traces -----------------------------

  createAgentRun(values: NewAgentRun): Promise<string> {
    return runRepo.createAgentRun(this.db, values);
  }

  completeAgentRun(runId: string, values: AgentRunCompletion): Promise<void> {
    return runRepo.completeAgentRun(this.db, runId, values);
  }

  persistRunResult(
    runId: string,
    review: NewReview,
    findings: Finding[],
    completion: AgentRunCompletion,
  ): Promise<{ review: ReviewEntity; findings: FindingEntity[] }> {
    return this.db.transaction(async (tx) => {
      const saved = await reviewRepo.insertReview(tx, review);
      const rows = await reviewRepo.insertFindings(tx, saved.id, findings);
      await runRepo.completeAgentRun(tx, runId, completion);
      return { review: saved, findings: rows };
    });
  }

  activeRunsForPull(workspaceId: string, prId: string): Promise<ActiveRun[]> {
    return runRepo.activeRunsForPull(this.db, workspaceId, prId);
  }

  listRunsForPull(workspaceId: string, prId: string): Promise<RunSummary[]> {
    return runRepo.listRunsForPull(this.db, workspaceId, prId);
  }

  deleteAgentRun(workspaceId: string, runId: string): Promise<boolean> {
    return runRepo.deleteAgentRun(this.db, workspaceId, runId);
  }

  runStatus(workspaceId: string, runId: string): Promise<string | null | undefined> {
    return runRepo.runStatus(this.db, workspaceId, runId);
  }

  cancelRunIfRunning(runId: string): Promise<boolean> {
    return runRepo.cancelRunIfRunning(this.db, runId);
  }

  reapStaleRunningRuns(): Promise<number> {
    return runRepo.reapStaleRunningRuns(this.db);
  }

  saveRunTrace(runId: string, trace: RunTrace): Promise<void> {
    return runRepo.saveRunTrace(this.db, runId, trace);
  }

  getRunTrace(runId: string): Promise<RunTrace | undefined> {
    return runRepo.getRunTrace(this.db, runId);
  }
}
