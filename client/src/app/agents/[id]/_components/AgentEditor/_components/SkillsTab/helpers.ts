import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** Linked skill ids in prompt order (ascending `order`). */
export function orderedLinkedIds(links: AgentSkillLink[]): string[] {
  return [...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id);
}

/** Move `draggedId` to sit at `targetId`'s position (drag & drop reorder).
 *  Returns the SAME array reference (no-op) when either id is missing or
 *  they're the same, so callers can skip firing a mutation for a no-op drop. */
export function reorderIds(ids: string[], draggedId: string, targetId: string): string[] {
  if (draggedId === targetId) return ids;
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, draggedId);
  return next;
}

/** Case-insensitive filter over a skill's name (the tab's `filterPlaceholder`
 *  filters "skills", not agents — name-only is enough here). */
export function filterSkillsByName(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((s) => s.name.toLowerCase().includes(q));
}

/** A skill can be freshly attached only when it's enabled — a disabled skill
 *  that's already linked stays visible (greyed) so it can still be detached
 *  or reordered, but its checkbox can't be (re)checked. */
export function canAttach(sk: Skill): boolean {
  return sk.enabled;
}
