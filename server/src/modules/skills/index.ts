/**
 * skills — public API (ring 1). Types, ports and constants other modules may
 * depend on. No Container, no concrete classes — see `compose.ts` for wiring.
 */
export type { SkillEntity, SkillStatsEntity, SkillVersionEntity } from './types.js';
export type { SkillStore, InsertSkill, UpdateSkill } from './ports.js';
export { INITIAL_SKILL_VERSION, MAX_IMPORT_BYTES } from './constants.js';
