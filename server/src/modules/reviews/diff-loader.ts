import type { Container } from '../../platform/container.js';
import type { UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import * as schema from '../../db/schema.js';
import { refreshPrFilesFromGitHub } from '../_shared/pr-files-sync.js';
import type { ReviewRepository, PullRow } from './repository.js';

/**
 * Load the unified diff for a PR. Prefers a real `git diff base...head`
 * against the local clone; falls back to assembling a synthetic unified diff
 * from the persisted pr_files patches (so the reviewer works even before a
 * clone completes / in tests).
 *
 * Two things stand between "throws or 0 files" and giving up silently — both
 * complete wiring that already existed but was never called:
 *  1. The local clone only ever tracks the default branch, so an open PR's
 *     head commit is unreachable until fetched — `container.git.fetchPullHead`
 *     does exactly that (GitHub's `pull/<n>/head`); retry the diff once after.
 *  2. `pr_files.patch` is otherwise only populated by the PR-detail route
 *     (`GET /pulls/:id`) — a review triggered before that route ever ran for
 *     this PR has nothing to reconstruct from. Backfill it on-demand from
 *     GitHub (best-effort — offline/no-token must not break the review) and
 *     retry the reconstruction once.
 * If both still come back empty, the caller (`run-executor.ts`) decides
 * whether an empty diff is a real failure or a legitimately-empty PR.
 */
export async function loadDiff(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repoRow: typeof schema.repos.$inferSelect,
): Promise<UnifiedDiff> {
  const repoRef = { owner: repoRow.owner, name: repoRow.name };

  try {
    const diff = await container.git.diff(repoRef, pull.base, pull.headSha);
    if (diff.files.length > 0) return diff;
  } catch {
    /* fall through to the fetchPullHead retry below */
  }

  try {
    await container.git.fetchPullHead(repoRef, pull.number);
    const diff = await container.git.diff(repoRef, pull.base, pull.headSha);
    if (diff.files.length > 0) return diff;
  } catch {
    /* repo not cloned at all, or still unresolvable — fall through */
  }

  const fromDb = await diffFromPrFiles(repo, pull.id);
  if (fromDb.files.length > 0) return fromDb;

  // pr_files was empty too — backfill it from GitHub once, then retry.
  const backfilled = await refreshPrFilesFromGitHub(container, repoRef, pull);
  if (!backfilled) return fromDb;
  return diffFromPrFiles(repo, pull.id);
}

/** Reconstruct a UnifiedDiff from persisted pr_files patches. */
export async function diffFromPrFiles(repo: ReviewRepository, prId: string): Promise<UnifiedDiff> {
  const files = await repo.getPrFiles(prId);
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parseUnifiedDiff(parts.join('\n'));
}
