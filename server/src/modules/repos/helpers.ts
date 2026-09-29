import { type Repo } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import type { RepoEntity } from './types.js';
import { GITHUB_URL_REGEX } from './constants.js';

/**
 * F1 — repos pure helpers (ring 1). Pure functions only — no I/O, no DB, no
 * container.
 */

/** Parse `owner`/`name` from a GitHub URL (https or ssh form). */
export function parseRepoUrl(url: string): { owner: string; name: string } {
  // https://github.com/owner/repo(.git)  |  git@github.com:owner/repo.git
  const match = url.match(GITHUB_URL_REGEX);
  if (!match?.[1] || !match[2]) {
    throw new AppError('invalid_repo_url', `Could not parse owner/repo from '${url}'`, 400);
  }
  return { owner: match[1], name: match[2] };
}

/** Map a repo entity to the API `Repo` DTO. */
export function toRepoDto(repo: RepoEntity): Repo {
  return {
    id: repo.id,
    workspace_id: repo.workspaceId,
    owner: repo.owner,
    name: repo.name,
    full_name: repo.fullName,
    default_branch: repo.defaultBranch,
    clone_path: repo.clonePath,
    last_polled_at: repo.lastPolledAt?.toISOString() ?? null,
    created_by: repo.createdBy,
  };
}
