import type { FindingRecord } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";
import { SEVERITY_ORDER, type FindingSeverity } from "../../severity";

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
