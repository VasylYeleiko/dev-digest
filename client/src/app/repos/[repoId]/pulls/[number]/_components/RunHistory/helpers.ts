import type { FindingRecord, PrCommit, RunSummary } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";
import { countBySeverity, SEVERITY_ORDER } from "../../severity";
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

export type Outcome = { key: string; color: string; bg: string; icon: IconName };

/**
 * A run's review OUTCOME, not just its lifecycle: a finished run with blockers
 * is "rejected", never a green "done". Derived from the denormalized
 * blocker/finding counts on the run row — the deterministic CI-gate signal,
 * not the model's verdict.
 */
export function outcomeOf(run: RunSummary): Outcome {
  const status = run.status ?? "";
  if (status === "running")
    return { key: "running", color: "var(--accent)", bg: "var(--accent-bg)", icon: "RefreshCw" };
  if (status === "failed")
    return { key: "error", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if (status === "cancelled")
    return { key: "cancelled", color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "X" };
  // Settled ("done"): color by the deterministic outcome.
  if ((run.blockers ?? 0) > 0)
    return { key: "rejected", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if ((run.findings_count ?? 0) > 0)
    return { key: "reviewed", color: "var(--warn)", bg: "var(--warn-bg)", icon: "MessageSquare" };
  return { key: "approved", color: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle" };
}

export type TimelineItem =
  | { kind: "run"; ts: number; run: RunSummary }
  | { kind: "commit"; ts: number; commit: PrCommit };

/** Epoch ms for sorting; unparseable / missing timestamps sort last. */
export function tsOf(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Date.parse(s);
  return Number.isNaN(n) ? 0 : n;
}

/** Runs and commits interleaved, newest first — which commit each review ran against. */
export function buildTimeline(runs: RunSummary[], commits: PrCommit[]): TimelineItem[] {
  return [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({ kind: "commit" as const, ts: tsOf(commit.committed_at), commit })),
  ].sort((a, b) => b.ts - a.ts);
}
