import { eq } from 'drizzle-orm';
import type { Container } from '../../platform/container.js';
import * as t from '../../db/schema.js';

/**
 * Refresh `pr_files` (path/additions/deletions/patch) for one PR from GitHub's
 * per-file detail (`pulls.listFiles`, via `GitHubClient.getPullRequest`) —
 * this is the ONLY thing on the real diff-text path that a fresh PR sync
 * doesn't already populate (`GET /repos/:id/pulls`'s list sync only carries
 * GitHub's lightweight list metadata, no per-file patches).
 *
 * Shared between `modules/pulls` (the PR-detail route, which refreshes on
 * every view) and `modules/reviews` (the diff loader, which refreshes
 * on-demand only when it's about to fall back to `pr_files` and finds it
 * empty) — lives in `_shared` rather than one module reaching into the
 * other's folder, per this package's DI convention (see `server/CLAUDE.md`).
 *
 * Best-effort: returns `false` (never throws) on any failure — no GitHub
 * token, offline, rate-limited, or a PR with zero files. Callers that need
 * to surface the failure should log/handle it themselves.
 */
export async function refreshPrFilesFromGitHub(
  container: Container,
  repo: { owner: string; name: string },
  pull: { id: string; number: number },
): Promise<boolean> {
  try {
    const gh = await container.github();
    const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pull.number);
    await container.db.delete(t.prFiles).where(eq(t.prFiles.prId, pull.id));
    if (detail.files.length === 0) return false;
    await container.db.insert(t.prFiles).values(
      detail.files.map((f) => ({
        prId: pull.id,
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null,
      })),
    );
    return true;
  } catch {
    return false;
  }
}
