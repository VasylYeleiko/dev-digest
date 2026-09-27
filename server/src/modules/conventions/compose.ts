import type { Container } from '../../platform/container.js';
import { renderPrompt } from '../../platform/prompts.js';
import { createAgentsService } from '../agents/compose.js';
import { createRepoStore } from '../repos/compose.js';
import { createSettingsService } from '../settings/compose.js';
import { createSkillsService } from '../skills/compose.js';
import { MAX_CONVENTIONS_REQUESTED, SYSTEM_PROMPT_TEMPLATE } from './constants.js';
import { ConventionsRepository } from './repository.js';
import { ConventionsService } from './service.js';
import type { ConventionStore } from './ports.js';

/**
 * conventions — composition (ring 4): builds the repository + service from the
 * Container and hands the service narrow ports onto repos, repo-intel,
 * settings, the clone on disk and the LLM providers.
 */

export function createConventionStore(c: Container): ConventionStore {
  return new ConventionsRepository(c.db);
}

export function createConventionsService(c: Container): ConventionsService {
  const settings = createSettingsService(c);
  return new ConventionsService({
    conventions: createConventionStore(c),
    repos: createRepoStore(c),
    sampler: c.repoIntel,
    files: c.sourceFiles,
    llm: (id) => c.llm(id),
    featureModel: (workspaceId) => settings.resolveFeatureModel(workspaceId, 'conventions'),
    systemPrompt: () =>
      renderPrompt(SYSTEM_PROMPT_TEMPLATE, { maxConventions: String(MAX_CONVENTIONS_REQUESTED) }),
    skills: createSkillsService(c),
    agents: createAgentsService(c),
  });
}
