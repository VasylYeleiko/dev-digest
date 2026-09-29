import type { Container } from '../../platform/container.js';
import { RepoRepository } from './repository.js';
import { RepoService } from './service.js';
import type { RepoStore } from './ports.js';

/**
 * repos — composition (ring 4): builds the module's repository + service from
 * the Container. Only routes.ts, app.ts, the Container and other modules'
 * compose.ts files import this; application code imports `./index.ts`.
 */

export function createRepoStore(c: Container): RepoStore {
  return new RepoRepository(c.db);
}

export function createRepoService(c: Container): RepoService {
  return new RepoService({
    repos: createRepoStore(c),
    jobs: c.jobs,
    git: c.git,
  });
}
