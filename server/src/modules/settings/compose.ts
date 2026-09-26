import type { Container } from '../../platform/container.js';
import { SettingsRepository } from './repository.js';
import { SettingsService } from './service.js';

/**
 * settings — composition (ring 4): builds the module's repository + service from
 * the Container. Only routes.ts, app.ts, the Container and other modules'
 * compose.ts files import this; application code imports `./index.ts`.
 */

export function createSettingsService(c: Container): SettingsService {
  return new SettingsService({
    settings: new SettingsRepository(c.db),
    secrets: c.secrets,
    github: () => c.github(),
    llm: (id) => c.llm(id),
    invalidateSecretCaches: () => c.invalidateSecretCaches(),
  });
}
