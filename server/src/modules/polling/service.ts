import type { GitHubClientResolver } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { RepoStore } from '../repos/index.js';
import type { PullStore } from '../pulls/index.js';

export interface PollingServiceDeps {
  repos: Pick<RepoStore, 'getById' | 'markPolled'>;
  pulls: Pick<PullStore, 'upsertFromGitHub'>;
  github: GitHubClientResolver;
}

/**
 * F1 — polling service (ring 2). MANUAL refresh that ONLY syncs the PR list
 * (new/updated PRs appear, head_sha updates). It never triggers a review —
 * review is manual (user presses Run Review, owned by the reviews module).
 */
export class PollingService {
  constructor(private deps: PollingServiceDeps) {}

  async poll(workspaceId: string, repoId: string): Promise<{ synced: number; reviewTriggered: false }> {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.deps.github();
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    for (const pr of pulls) {
      await this.deps.pulls.upsertFromGitHub(workspaceId, repo.id, pr);
    }
    await this.deps.repos.markPolled(repo.id);

    return { synced: pulls.length, reviewTriggered: false };
  }
}
