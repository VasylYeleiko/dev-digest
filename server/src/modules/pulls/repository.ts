import { and, desc, eq, inArray } from 'drizzle-orm';
import type { PrMeta } from '@devdigest/shared';
import { advisoryXactLock, type Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullStore } from './ports.js';
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
 * F1 — pulls data-access (ring 3); implements `PullStore`. Owns
 * `pull_requests`, `pr_files`, `pr_commits`; reads `reviews` / `findings` /
 * `agent_runs` only for the PR list's read model.
 */
export class PullRepository implements PullStore {
  constructor(private db: Db) {}

  async listByRepo(repoId: string): Promise<PullEntity[]> {
    return this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  async getInWorkspace(workspaceId: string, id: string): Promise<PullEntity | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, id)));
    return row;
  }

  async upsertFromGitHub(workspaceId: string, repoId: string, pr: PrMeta): Promise<void> {
    const updatedAt = pr.updated_at ? new Date(pr.updated_at) : null;
    await this.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        headSha: pr.head_sha,
        additions: pr.additions,
        deletions: pr.deletions,
        filesCount: pr.files_count,
        status: pr.status,
        openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: [t.pullRequests.repoId, t.pullRequests.number],
        set: { title: pr.title, headSha: pr.head_sha, status: pr.status, updatedAt },
      });
  }

  async updateDiffStats(id: string, stats: DiffStats): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ additions: stats.additions, deletions: stats.deletions, filesCount: stats.filesCount })
      .where(eq(t.pullRequests.id, id));
  }

  async markReviewed(id: string, sha: string): Promise<void> {
    await this.db.update(t.pullRequests).set({ lastReviewedSha: sha }).where(eq(t.pullRequests.id, id));
  }

  async updateDetail(id: string, detail: DiffStats & { body: string | null }): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({
        body: detail.body,
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.filesCount,
      })
      .where(eq(t.pullRequests.id, id));
  }

  async listFiles(prId: string): Promise<PrFileEntity[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  /**
   * Delete-then-insert as one unit, serialized per PR: readers never see an
   * empty file list, a failed insert keeps the old rows, and two concurrent
   * refreshes (PR view + review refresher) can't both insert — `pr_files` has
   * no unique key to stop duplicates.
   */
  async replaceFiles(prId: string, files: PrFileEntity[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await advisoryXactLock(tx, `pr_files:${prId}`);
      await tx.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
      if (files.length === 0) return;
      await tx.insert(t.prFiles).values(
        files.map((f) => ({
          prId,
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch,
        })),
      );
    });
  }

  async listCommits(prId: string): Promise<PrCommitEntity[]> {
    return this.db
      .select({
        sha: t.prCommits.sha,
        message: t.prCommits.message,
        author: t.prCommits.author,
        committedAt: t.prCommits.committedAt,
      })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId));
  }

  /** Same unit-of-work + per-PR serialization as `replaceFiles`. */
  async replaceCommits(prId: string, commits: PrCommitEntity[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await advisoryXactLock(tx, `pr_commits:${prId}`);
      await tx.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
      if (commits.length === 0) return;
      await tx.insert(t.prCommits).values(
        commits.map((c) => ({
          prId,
          sha: c.sha,
          message: c.message,
          author: c.author,
          committedAt: c.committedAt,
        })),
      );
    });
  }

  async reviewScores(prIds: string[]): Promise<ReviewScore[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ id: t.reviews.id, prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }

  async findingPreviews(reviewIds: string[]): Promise<FindingPreview[]> {
    if (reviewIds.length === 0) return [];
    return this.db
      .select({
        reviewId: t.findings.reviewId,
        id: t.findings.id,
        severity: t.findings.severity,
        category: t.findings.category,
        title: t.findings.title,
        file: t.findings.file,
        startLine: t.findings.startLine,
        confidence: t.findings.confidence,
        rationale: t.findings.rationale,
      })
      .from(t.findings)
      .where(inArray(t.findings.reviewId, reviewIds));
  }

  async successfulRunCosts(workspaceId: string, prIds: string[]): Promise<RunCost[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ prId: t.agentRuns.prId, costUsd: t.agentRuns.costUsd })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          inArray(t.agentRuns.prId, prIds),
          eq(t.agentRuns.status, 'done'),
        ),
      );
  }
}
