import type { Logger } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { WidgetRepository } from './repository.js';
import { WidgetService } from './service.js';
import type { WidgetStore } from './ports.js';

/** widgets — composition (ring 4). Only routes.ts, app.ts and other compose.ts files import this. */
export function createWidgetStore(c: Container): WidgetStore {
  return new WidgetRepository(c.db);
}

export function createWidgetService(c: Container, logger: Logger): WidgetService {
  return new WidgetService({ widgets: createWidgetStore(c), logger });
}
