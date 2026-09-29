import type { Logger } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { createRepoStore } from '../repos/compose.js';
import { PullRepository } from './repository.js';
import { PullService } from './service.js';
import type { PullStore } from './ports.js';

/**
 * pulls — composition (ring 4): builds the module's repository + service from
 * the Container. Only routes.ts, app.ts, the Container and other modules'
 * compose.ts files import this; application code imports `./index.ts`.
 */

export function createPullStore(c: Container): PullStore {
  return new PullRepository(c.db);
}

export function createPullService(c: Container, logger: Logger): PullService {
  return new PullService({
    pulls: createPullStore(c),
    repos: createRepoStore(c),
    github: () => c.github(),
    logger,
  });
}
