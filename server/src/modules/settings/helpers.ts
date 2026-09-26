import type { Settings } from '@devdigest/shared';
import type { SettingEntry } from './types.js';

/** Collapse key/value setting entries into a flat `Settings` object. */
export function rowsToSettings(rows: SettingEntry[]): Settings {
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}
