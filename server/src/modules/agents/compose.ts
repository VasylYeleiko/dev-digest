import type { Container } from '../../platform/container.js';
import { AgentsRepository } from './repository.js';
import { AgentsService } from './service.js';
import type { AgentStore } from './ports.js';

/**
 * agents — composition (ring 4): builds the module's repository + service from
 * the Container. Only routes.ts, app.ts, the Container and other modules'
 * compose.ts files import this; application code imports `./index.ts`.
 */

export function createAgentStore(c: Container): AgentStore {
  return new AgentsRepository(c.db);
}

export function createAgentsService(c: Container): AgentsService {
  return new AgentsService({ agents: createAgentStore(c), llm: (id) => c.llm(id) });
}
