import type { Container } from '../../platform/container.js';
import { createRepoStore } from '../repos/compose.js';
import { createPullStore } from '../pulls/compose.js';
import { PollingService } from './service.js';

/**
 * polling — composition (ring 4): builds the module's repository + service from
 * the Container. Only routes.ts, app.ts, the Container and other modules'
 * compose.ts files import this; application code imports `./index.ts`.
 */

export function createPollingService(c: Container): PollingService {
  return new PollingService({
    repos: createRepoStore(c),
    pulls: createPullStore(c),
    github: () => c.github(),
  });
}
