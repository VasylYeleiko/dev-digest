import type {
  GitHubClient,
  GitHubClientResolver,
  Logger,
  PrCommentInput,
  PrDetail,
  PrMeta,
  PrReviewComment,
  RepoRef,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { RepoStore } from '../repos/index.js';
import type { PullStore } from './ports.js';
import type { PullEntity } from './types.js';
import { rollupCostByPr } from './status.js';
import {
  groupByReview,
  latestReviewByPr,
  toPersistedPrDetail,
  toPrCommitEntities,
  toPrFileEntities,
  toPrListItem,
} from './helpers.js';

/**
 * Diff stats aren't on GitHub's PR-list payload; freshly-imported PRs are
 * backfilled from the detail endpoint, at most this many per list request.
 */
const BACKFILL_LIMIT = 10;

export interface PullServiceDeps {
  pulls: PullStore;
  repos: Pick<RepoStore, 'getById'>;
  github: GitHubClientResolver;
  logger: Logger;
}

/**
 * F1 — pulls service (ring 2). PR import via the GitHub port (list + per-PR
 * detail + inline comments), local-first: every read still works offline from
 * the persisted rows. Import is idempotent (unique repo_id+number). Review
 * trigger is MANUAL and owned by the reviews module — this one only imports/reads.
 */
export class PullService {
  constructor(private deps: PullServiceDeps) {}

  /** GitHub client, or null (logged) when no token is configured / offline. */
  private async tryGitHub(context: string): Promise<GitHubClient | null> {
    try {
      return await this.deps.github();
    } catch (err) {
      this.deps.logger.warn({ err }, context);
      return null;
    }
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  private async requirePullAndRepo(workspaceId: string, prId: string) {
    const pull = await this.deps.pulls.getInWorkspace(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.requireRepo(workspaceId, pull.repoId);
    return { pull, repo: { owner: repo.owner, name: repo.name } satisfies RepoRef };
  }

  /**
   * PRs of a repo for the list: synced from GitHub when a token is configured
   * (never failing the read), then enriched with the latest review's SCORE +
   * FINDINGS and the all-time COST of every successful run.
   */
  async listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    const gh = await this.tryGitHub('GitHub client unavailable (no token / offline); serving persisted PRs');

    if (gh) {
      try {
        for (const pr of await gh.listPullRequests(ref)) {
          await this.deps.pulls.upsertFromGitHub(workspaceId, repo.id, pr);
        }
      } catch (err) {
        this.deps.logger.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    let pulls = await this.deps.pulls.listByRepo(repo.id);
    if (gh) pulls = await this.backfillDiffStats(gh, ref, pulls);

    // Latest review per PR (score + findings) and total cost: computed on read
    // (no FK denorm); the list is small, so IN-queries + JS grouping are cheap.
    const prIds = pulls.map((p) => p.id);
    const latest = latestReviewByPr(await this.deps.pulls.reviewScores(prIds));
    const findingsByReview = groupByReview(
      await this.deps.pulls.findingPreviews([...latest.values()].map((rv) => rv.id)),
    );
    const costByPr = rollupCostByPr(await this.deps.pulls.successfulRunCosts(workspaceId, prIds));

    const now = Date.now();
    return pulls.map((p) => {
      const review = latest.get(p.id);
      return toPrListItem(
        p,
        review ? { score: review.score, findings: findingsByReview.get(review.id) ?? [] } : undefined,
        costByPr.get(p.id) ?? null,
        now,
      );
    });
  }

  /** Backfill zeroed diff stats from the detail endpoint (capped per request). */
  private async backfillDiffStats(gh: GitHubClient, ref: RepoRef, pulls: PullEntity[]) {
    const need = new Set(
      pulls
        .filter((p) => p.additions === 0 && p.deletions === 0 && p.filesCount === 0)
        .slice(0, BACKFILL_LIMIT)
        .map((p) => p.id),
    );
    const out: PullEntity[] = [];
    for (const p of pulls) {
      if (!need.has(p.id)) {
        out.push(p);
        continue;
      }
      try {
        const detail = await gh.getPullRequest(ref, p.number);
        const stats = { additions: detail.additions, deletions: detail.deletions, filesCount: detail.files_count };
        await this.deps.pulls.updateDiffStats(p.id, stats);
        out.push({ ...p, ...stats });
      } catch (err) {
        this.deps.logger.warn({ err, number: p.number }, 'PR diff-stat backfill skipped');
        out.push(p);
      }
    }
    return out;
  }

  /**
   * Full PR detail. Local-first: refresh files/commits/body from GitHub when a
   * token is configured; otherwise serve the persisted detail so it works offline.
   */
  async detail(workspaceId: string, prId: string): Promise<PrDetail> {
    const { pull, repo } = await this.requirePullAndRepo(workspaceId, prId);
    try {
      const gh = await this.deps.github();
      const detail = await gh.getPullRequest(repo, pull.number);
      await this.deps.pulls.replaceFiles(pull.id, toPrFileEntities(detail.files));
      await this.deps.pulls.replaceCommits(pull.id, toPrCommitEntities(detail.commits));
      await this.deps.pulls.updateDetail(pull.id, {
        body: detail.body ?? null,
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      });
      return { ...detail, id: pull.id };
    } catch (err) {
      this.deps.logger.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      const [files, commits] = await Promise.all([
        this.deps.pulls.listFiles(pull.id),
        this.deps.pulls.listCommits(pull.id),
      ]);
      return toPersistedPrDetail(pull, files, commits);
    }
  }

  /**
   * Refresh `pr_files` (path/additions/deletions/patch) for one PR from GitHub's
   * per-file detail — the only thing on the real diff-text path a list sync
   * doesn't populate. Used by the reviews module's diff loader when it's about
   * to fall back to `pr_files` and finds it empty.
   *
   * Best-effort: returns `false` (never throws) on any failure — no GitHub
   * token, offline, rate-limited, or a PR with zero files.
   */
  async refreshFiles(repo: RepoRef, pull: { id: string; number: number }): Promise<boolean> {
    try {
      const gh = await this.deps.github();
      const detail = await gh.getPullRequest(repo, pull.number);
      await this.deps.pulls.replaceFiles(pull.id, toPrFileEntities(detail.files));
      return detail.files.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Inline review comments, proxied live to GitHub (no local mirror, so the
   * Files-changed tab stays in lock-step). Empty when GitHub is unreachable.
   */
  async listComments(workspaceId: string, prId: string): Promise<PrReviewComment[]> {
    const { pull, repo } = await this.requirePullAndRepo(workspaceId, prId);
    const gh = await this.tryGitHub('GitHub client unavailable; serving no PR comments');
    if (!gh) return [];
    try {
      return await gh.listReviewComments(repo, pull.number);
    } catch (err) {
      this.deps.logger.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  /** Post one inline review comment (or reply) to GitHub on the PR's head commit. */
  async createComment(workspaceId: string, prId: string, input: PrCommentInput): Promise<PrReviewComment> {
    const { pull, repo } = await this.requirePullAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }
    try {
      return await gh.createReviewComment(repo, pull.number, {
        commitId: pull.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      // Surface only its message — the stringified error object adds nothing
      // for the user and can carry request internals.
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400);
    }
  }
}
