/* Finding severity — order, the three contract values and a tally. Shared by
   several PR-detail components (FindingsPanel, RunHistory), so it lives at the
   route level instead of inside one component's folder. */
import type { FindingRecord } from "@devdigest/shared";

/** Sort weight per severity (lower = shown first). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/** Render order for the counter pills + filter buttons (contract enum, 3 values). */
export const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;
export type FindingSeverity = (typeof SEVERITIES)[number];

/** Tally ALL findings by severity — independent of any visibility filter. */
export function countBySeverity(findings: FindingRecord[]): Record<FindingSeverity, number> {
  const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } as Record<FindingSeverity, number>;
  for (const f of findings) {
    if ((SEVERITIES as readonly string[]).includes(f.severity)) {
      counts[f.severity as FindingSeverity] += 1;
    }
  }
  return counts;
}
