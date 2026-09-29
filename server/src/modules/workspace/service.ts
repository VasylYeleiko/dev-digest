import type { RepoStore } from '../repos/index.js';

/**
 * F1 — workspace service (ring 2): where clones live + a summary of the
 * workspace's repos and their clone state.
 */

export interface WorkspaceSummary {
  workspaceId: string;
  cloneDir: string;
  repos: {
    id: string;
    full_name: string;
    clone_path: string | null;
    last_polled_at: string | null;
    cloned: boolean;
  }[];
}

export interface WorkspaceServiceDeps {
  repos: Pick<RepoStore, 'list'>;
  cloneDir: string;
}

export class WorkspaceService {
  constructor(private deps: WorkspaceServiceDeps) {}

  async summary(workspaceId: string): Promise<WorkspaceSummary> {
    const repos = await this.deps.repos.list(workspaceId);
    return {
      workspaceId,
      cloneDir: this.deps.cloneDir,
      repos: repos.map((r) => ({
        id: r.id,
        full_name: r.fullName,
        clone_path: r.clonePath,
        last_polled_at: r.lastPolledAt?.toISOString() ?? null,
        cloned: Boolean(r.clonePath),
      })),
    };
  }
}
