/**
 * settings — public API (ring 1). Types, ports and constants other modules may
 * depend on. No Container, no concrete classes — see `compose.ts` for wiring.
 */
export type { SettingEntry } from './types.js';
export type { SettingsStore } from './ports.js';
export { defaultFeatureModel } from './feature-models.js';
