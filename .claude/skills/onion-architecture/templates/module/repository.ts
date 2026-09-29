import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { WidgetStore } from './ports.js';
import type { WidgetEntity } from './types.js';

/** widgets — data access (ring 3). The ONLY file touching `widgets`. Workspace-scoped. */
export class WidgetRepository implements WidgetStore {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<WidgetEntity[]> {
    return this.db.select().from(t.widgets).where(eq(t.widgets.workspaceId, workspaceId));
  }

  async getById(workspaceId: string, id: string): Promise<WidgetEntity | undefined> {
    const [row] = await this.db
      .select()
      .from(t.widgets)
      .where(and(eq(t.widgets.workspaceId, workspaceId), eq(t.widgets.id, id)));
    return row; // compiles only while the row is assignable to WidgetEntity
  }

  async insert(values: { workspaceId: string; name: string }): Promise<WidgetEntity> {
    const [row] = await this.db.insert(t.widgets).values(values).returning();
    return row!;
  }
}
