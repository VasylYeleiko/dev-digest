import type { WidgetEntity } from './types.js';

/** widgets — pure helpers (ring 1). Entity → wire contract (snake_case). */
export function toWidgetDto(w: WidgetEntity) {
  return { id: w.id, name: w.name, created_at: w.createdAt.toISOString() };
}
