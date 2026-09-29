/**
 * repo-intel — public API (ring 1). The `RepoIntel` facade contract, its row
 * types, the persistence port and constants. Features (reviews prompt-assembly,
 * blast, onboarding, …) import THIS, never the service, repository or the
 * parsing libraries. Wiring lives in `compose.ts`.
 */
export * from './types.js';
export * from './constants.js';
export type * from './ports.js';
