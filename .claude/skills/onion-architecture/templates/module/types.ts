/** widgets — domain types (ring 1). camelCase; no Drizzle, no wire names. */
export interface WidgetEntity {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: Date;
}
