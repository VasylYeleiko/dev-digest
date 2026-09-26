import type { WidgetEntity } from './types.js';

/** widgets — persistence port (ring 1); implemented by WidgetRepository. */
export interface WidgetStore {
  list(workspaceId: string): Promise<WidgetEntity[]>;
  getById(workspaceId: string, id: string): Promise<WidgetEntity | undefined>;
  insert(values: { workspaceId: string; name: string }): Promise<WidgetEntity>;
}
