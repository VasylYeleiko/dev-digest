import type { Agent } from "@devdigest/shared";

/** Pre-select one agent so the common path is one click: the first enabled one. */
export function defaultAgentIds(agents: readonly Agent[]): string[] {
  const first = agents.find((a) => a.enabled);
  return first ? [first.id] : [];
}

export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export interface DraftFormState {
  name: string;
  body: string;
  enabled: boolean;
  agentIds: readonly string[];
}

/** Mirrors the server's refusals so Create is disabled instead of failing with a 422. */
export function canCreate(f: DraftFormState): boolean {
  if (f.name.trim().length === 0 || f.body.trim().length === 0) return false;
  return f.enabled || f.agentIds.length === 0;
}
