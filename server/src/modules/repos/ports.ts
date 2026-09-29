import type { RepoEntity } from './types.js';

/**
 * repos — persistence port (ring 1). RepoService depends on this interface;
 * RepoRepository (Drizzle, ring 3) implements it. Other modules that need to
 * read or touch a repo row depend on it too, through `repos/index.ts`.
 */

export interface InsertRepo {
  workspaceId: string;
  owner: string;
  name: string;
  fullName: string;
  createdBy: string;
}

export interface RepoStore {
  /** Find a repo in a workspace by its `owner/name` full name (dedupe on add). */
  findByFullName(workspaceId: string, fullName: string): Promise<RepoEntity | undefined>;
  list(workspaceId: string): Promise<RepoEntity[]>;
  getById(workspaceId: string, id: string): Promise<RepoEntity | undefined>;
  insert(values: InsertRepo): Promise<RepoEntity>;
  /**
   * The workspace owning a repo — NOT tenancy-scoped. Only for background jobs
   * whose payload came out of an already-authenticated request.
   */
  workspaceIdFor(repoId: string): Promise<string | null>;
  /** Persist the clone path and bump `last_polled_at` once a clone job completes. */
  updateClonePath(repoId: string, clonePath: string): Promise<void>;
  /** Bump `last_polled_at` after a PR-list sync. */
  markPolled(repoId: string): Promise<void>;
  remove(workspaceId: string, id: string): Promise<boolean>;
}
