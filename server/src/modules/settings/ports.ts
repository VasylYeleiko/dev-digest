import type { SettingEntry } from './types.js';

/** settings — persistence port (ring 1); implemented by SettingsRepository. */
export interface SettingsStore {
  /** Every non-secret pref row in the workspace (all users). */
  listForWorkspace(workspaceId: string): Promise<SettingEntry[]>;
  /** Insert or replace one key for a (workspace, user). */
  upsert(workspaceId: string, userId: string, key: string, value: unknown): Promise<void>;
}
