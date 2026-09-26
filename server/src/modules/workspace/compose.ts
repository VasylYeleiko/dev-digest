import type { Container } from '../../platform/container.js';
import { createRepoStore } from '../repos/compose.js';
import { WorkspaceService } from './service.js';

/**
 * workspace — composition (ring 4): builds the module's repository + service from
 * the Container. Only routes.ts, app.ts, the Container and other modules'
 * compose.ts files import this; application code imports `./index.ts`.
 */

export function createWorkspaceService(c: Container): WorkspaceService {
  return new WorkspaceService({ repos: createRepoStore(c), cloneDir: c.config.cloneDir });
}
