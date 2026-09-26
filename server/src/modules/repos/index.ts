/**
 * repos — public API (ring 1). Types, ports and constants other modules may
 * depend on. No Container, no concrete classes — see `compose.ts` for wiring.
 */
export type { RepoEntity, CloneJobPayload } from './types.js';
export type { RepoStore, InsertRepo } from './ports.js';
