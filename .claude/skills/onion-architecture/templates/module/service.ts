import type { Logger } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { WidgetStore } from './ports.js';
import { toWidgetDto } from './helpers.js';

/** Everything the service needs — ports only, wired in compose.ts. */
export interface WidgetServiceDeps {
  widgets: WidgetStore;
  logger: Logger;
}

/** widgets — use cases (ring 2). No HTTP, no SQL, no concrete adapter. */
export class WidgetService {
  constructor(private deps: WidgetServiceDeps) {}

  async list(workspaceId: string) {
    return (await this.deps.widgets.list(workspaceId)).map(toWidgetDto);
  }

  async get(workspaceId: string, id: string) {
    const widget = await this.deps.widgets.getById(workspaceId, id);
    if (!widget) throw new NotFoundError('Widget not found');
    return toWidgetDto(widget);
  }

  async create(workspaceId: string, name: string) {
    return toWidgetDto(await this.deps.widgets.insert({ workspaceId, name }));
  }
}
