import type { FindingRecord } from "@devdigest/shared";

/** Open blockers in one review run: CRITICAL findings the user hasn't dismissed. */
export function openBlockers(findings: FindingRecord[]): number {
  return findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
}
