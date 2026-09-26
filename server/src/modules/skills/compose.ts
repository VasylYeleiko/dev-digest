import type { Container } from '../../platform/container.js';
import { SkillsRepository } from './repository.js';
import { SkillsService } from './service.js';
import type { SkillStore } from './ports.js';

/**
 * skills — composition (ring 4): builds the module's repository + service from
 * the Container. Only routes.ts, app.ts, the Container and other modules'
 * compose.ts files import this; application code imports `./index.ts`.
 */

export function createSkillStore(c: Container): SkillStore {
  return new SkillsRepository(c.db);
}

export function createSkillsService(c: Container): SkillsService {
  return new SkillsService({ skills: createSkillStore(c) });
}
