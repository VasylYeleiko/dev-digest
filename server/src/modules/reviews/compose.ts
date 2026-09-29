import type { Logger } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { createAgentStore } from '../agents/compose.js';
import { createPullService, createPullStore } from '../pulls/compose.js';
import { createRepoStore } from '../repos/compose.js';
import { createSkillStore } from '../skills/compose.js';
import { ReviewRepository } from './repository.js';
import { ReviewRunExecutor } from './run-executor.js';
import { ReviewService } from './service.js';

/**
 * reviews — composition (ring 4): builds the review store, the background run
 * executor and the service from the Container. Only routes.ts, app.ts and the
 * Container import this; application code imports `./index.ts`.
 */
export function createReviewService(c: Container, logger: Logger): ReviewService {
  const reviews = new ReviewRepository(c.db);
  const pulls = createPullStore(c);
  const skillStore = createSkillStore(c);
  const executor = new ReviewRunExecutor({
    reviews,
    pulls,
    git: c.git,
    prFiles: createPullService(c, logger),
    llm: (id) => c.llm(id),
    repoIntel: c.repoIntel,
    runBus: c.runBus,
    skills: skillStore,
  });
  return new ReviewService({
    reviews,
    agents: createAgentStore(c),
    pulls,
    repos: createRepoStore(c),
    runBus: c.runBus,
    executor,
  });
}
