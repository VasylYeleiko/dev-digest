import type { PrStatus } from '@devdigest/shared';

/**
 * PR-list rollup helpers (pure — no DB / `this`, so they unit-test cleanly).
 *
 * The Pull Requests list shows, per PR: the latest review's SCORE, a FINDINGS
 * severity breakdown, a review STATUS, and the total COST of every successful
 * run. The DB `status` column holds GitHub's merge state (open/merged/closed);
 * the review status (needs_review / reviewed / stale) is DERIVED here for OPEN
 * PRs from the commit a review last ran against (`lastReviewedSha`) vs the PR
 * head, plus age.
 */

/** Open PRs whose current head was reviewed but untouched this long read "stale". */
export const STALE_DAYS = 7;

export interface SeverityCounts {
  critical: number;
  warning: number;
  suggestion: number;
}

/** Tally finding severities (CRITICAL / WARNING / SUGGESTION) for one review. */
export function rollupSeverities(rows: { severity: string }[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.critical += 1;
    else if (r.severity === 'WARNING') c.warning += 1;
    else if (r.severity === 'SUGGESTION') c.suggestion += 1;
  }
  return c;
}

const SEVERITY_SORT_WEIGHT: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** Default cap on how many findings the PR-list row popover shows per PR. */
export const FINDINGS_PREVIEW_MAX = 10;

/**
 * Severity-first, then confidence-desc, capped — what the row popover shows
 * for "N FINDINGS IN THIS RUN". Pure sort + slice, no mutation of `rows`.
 */
export function previewFindings<T extends { severity: string; confidence: number }>(
  rows: T[],
  max: number = FINDINGS_PREVIEW_MAX,
): T[] {
  return [...rows]
    .sort((a, b) => {
      const sev = (SEVERITY_SORT_WEIGHT[a.severity] ?? 9) - (SEVERITY_SORT_WEIGHT[b.severity] ?? 9);
      return sev !== 0 ? sev : b.confidence - a.confidence;
    })
    .slice(0, max);
}

/**
 * Sum every priced successful run per PR (all-time — no batch window). A PR
 * with no priced run gets NO entry in the returned map, so the route yields
 * `null` → the UI renders "—", never "$0.00". A genuine 0-cost run (a free
 * model) DOES get an entry, so it correctly renders "$0.00".
 */
export function rollupCostByPr(
  rows: { prId: string | null; costUsd: number | null }[],
): Map<string, number> {
  const costByPr = new Map<string, number>();
  for (const row of rows) {
    if (!row.prId || row.costUsd == null) continue;
    costByPr.set(row.prId, (costByPr.get(row.prId) ?? 0) + row.costUsd);
  }
  return costByPr;
}

/**
 * Review-freshness status for the PR list. Merged/closed PRs keep their GitHub
 * merge state; open PRs map to:
 *  - `needs_review` — never reviewed, OR head moved since the last review
 *  - `stale`        — current head was reviewed but the PR is older than STALE_DAYS
 *  - `reviewed`     — current head reviewed and recent
 */
export function deriveReviewStatus(args: {
  /** DB `status` column = GitHub merge state (open/merged/closed). */
  ghStatus: string;
  lastReviewedSha: string | null;
  headSha: string;
  updatedAt: Date | null;
  now: number;
  staleDays?: number;
}): PrStatus {
  const { ghStatus, lastReviewedSha, headSha, updatedAt, now } = args;
  if (ghStatus === 'merged' || ghStatus === 'closed') return ghStatus as PrStatus;
  if (!lastReviewedSha || lastReviewedSha !== headSha) return 'needs_review';
  const staleMs = (args.staleDays ?? STALE_DAYS) * 86_400_000;
  if (updatedAt && now - updatedAt.getTime() > staleMs) return 'stale';
  return 'reviewed';
}
