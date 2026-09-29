import { cpus } from 'node:os';
import type { Container } from '../../platform/container.js';
import { RepoIntelRepository } from './repository.js';
import { RepoIntelService } from './service.js';
import { createRepoStore } from '../repos/compose.js';

/**
 * repo-intel — composition (ring 4): builds the store + facade service from
 * the Container. Only routes.ts and the Container import this; other modules
 * code against the `RepoIntel` facade type from `./index.ts`.
 */
export function createRepoIntelService(c: Container): RepoIntelService {
  return new RepoIntelService({
    store: new RepoIntelRepository(c.db),
    git: c.git,
    codeIndex: c.codeIndex,
    jobs: c.jobs,
    repos: createRepoStore(c),
    parser: c.codeParser,
    files: c.sourceFiles,
    depgraph: c.depgraph,
    tokenizer: c.tokenizer,
    indexConcurrency: Math.max(1, cpus().length - 1),
    enabled: c.config.repoIntelEnabled,
  });
}
