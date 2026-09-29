/**
 * repos — domain types (ring 1). Plain camelCase shapes; no Drizzle, no wire
 * names. The repository maps rows into these; helpers.ts maps them to the
 * `Repo` wire contract.
 */

/** A GitHub repository tracked by a workspace (and, once cloned, on disk). */
export interface RepoEntity {
  id: string;
  workspaceId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  clonePath: string | null;
  lastPolledAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
}

/** Payload enqueued for (and consumed by) the `clone` job. */
export interface CloneJobPayload {
  repoId: string;
  owner: string;
  name: string;
  url: string;
}
