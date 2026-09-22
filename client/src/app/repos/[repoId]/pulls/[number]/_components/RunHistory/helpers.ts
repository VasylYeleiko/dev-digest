import type { FindingRecord } from "@devdigest/shared";
import { countBySeverity } from "../FindingsPanel/helpers";
import { SEVERITY_ORDER } from "../FindingsPanel/constants";
import type { FindingsCounts } from "@/components/FindingsPopover";

/** A run's findings, tallied by severity, in the lowercase shape
 *  `FindingsPopover` expects (mirrors `PrMeta.findings`). */
export function severityCounts(findings: FindingRecord[]): FindingsCounts {
  const c = countBySeverity(findings);
  return { critical: c.CRITICAL, warning: c.WARNING, suggestion: c.SUGGESTION };
}

/** Severity-first, then confidence-desc — the same order the server's
 *  `previewFindings` uses for the PR list (`pulls/status.ts`), so both
 *  popovers read alike. Unlike the server preview, this is not capped: the
 *  panel already scrolls, and a run's findings live entirely on the client. */
export function sortedForPreview(findings: FindingRecord[]): FindingRecord[] {
  return [...findings].sort((a, b) => {
    const sev = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    if (sev !== 0) return sev;
    return b.confidence - a.confidence;
  });
}
