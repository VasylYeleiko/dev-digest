import type { FindingRecord } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER, SEVERITIES, type FindingSeverity } from "./constants";

/**
 * Optionally drop low-confidence findings, optionally keep only one severity,
 * and sort by severity. `severity` of `undefined`/`null` keeps all severities.
 */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity?: FindingSeverity | null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/** Tally ALL findings by severity — independent of the hide-low toggle. */
export function countBySeverity(findings: FindingRecord[]): Record<FindingSeverity, number> {
  const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } as Record<FindingSeverity, number>;
  for (const f of findings) {
    if ((SEVERITIES as readonly string[]).includes(f.severity)) {
      counts[f.severity as FindingSeverity] += 1;
    }
  }
  return counts;
}
