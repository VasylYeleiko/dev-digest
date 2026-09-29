import type { GitClient, RepoRef, UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../platform/diff-parser.js';
import type { PullEntity, PullStore } from '../pulls/index.js';
import type { PrFilesRefresher } from './ports.js';

export interface DiffLoaderDeps {
  git: GitClient;
  pulls: Pick<PullStore, 'listFiles'>;
  prFiles: PrFilesRefresher;
}

/**
 * Load the unified diff for a PR (ring 2). Prefers a real `git diff base...head`
 * against the local clone; falls back to assembling a synthetic unified diff
 * from the persisted pr_files patches (so the reviewer works even before a
 * clone completes / in tests).
 *
 * Two things stand between "throws or 0 files" and giving up silently:
 *  1. The local clone only ever tracks the default branch, so an open PR's
 *     head commit is unreachable until fetched — `git.fetchPullHead` does
 *     exactly that (GitHub's `pull/<n>/head`); retry the diff once after.
 *  2. `pr_files.patch` is otherwise only populated by the PR-detail route
 *     (`GET /pulls/:id`) — a review triggered before that route ever ran for
 *     this PR has nothing to reconstruct from. Backfill it on-demand from
 *     GitHub (best-effort — offline/no-token must not break the review) and
 *     retry the reconstruction once.
 * If both still come back empty, the caller (`run-executor.ts`) decides
 * whether an empty diff is a real failure or a legitimately-empty PR.
 */
export async function loadDiff(
  deps: DiffLoaderDeps,
  pull: Pick<PullEntity, 'id' | 'number' | 'base' | 'headSha'>,
  repoRef: RepoRef,
): Promise<UnifiedDiff> {
  try {
    const diff = await deps.git.diff(repoRef, pull.base, pull.headSha);
    if (diff.files.length > 0) return diff;
  } catch {
    /* fall through to the fetchPullHead retry below */
  }

  try {
    await deps.git.fetchPullHead(repoRef, pull.number);
    const diff = await deps.git.diff(repoRef, pull.base, pull.headSha);
    if (diff.files.length > 0) return diff;
  } catch {
    /* repo not cloned at all, or still unresolvable — fall through */
  }

  const fromDb = await diffFromPrFiles(deps.pulls, pull.id);
  if (fromDb.files.length > 0) return fromDb;

  // pr_files was empty too — backfill it from GitHub once, then retry.
  const backfilled = await deps.prFiles.refreshFiles(repoRef, pull);
  if (!backfilled) return fromDb;
  return diffFromPrFiles(deps.pulls, pull.id);
}

/** Reconstruct a UnifiedDiff from persisted pr_files patches. */
export async function diffFromPrFiles(
  pulls: Pick<PullStore, 'listFiles'>,
  prId: string,
): Promise<UnifiedDiff> {
  const files = await pulls.listFiles(prId);
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
