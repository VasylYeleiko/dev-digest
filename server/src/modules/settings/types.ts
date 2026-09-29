/** settings — domain types (ring 1). */

/** One persisted non-secret preference (a key/value pair). */
export interface SettingEntry {
  key: string;
  value: unknown;
}
