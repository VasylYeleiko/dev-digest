import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

/**
 * Each agent run's findings, keyed by `run_id` — powers the timeline rows.
 * Takes REVIEWS (not agent runs; see client/INSIGHTS.md). Appends rather than
 * overwrites: one run can produce both a `summary` and a `review` row.
 */
export function groupFindingsByRun(reviews: ReviewRecord[]): Record<string, FindingRecord[]> {
  const map: Record<string, FindingRecord[]> = {};
  for (const review of reviews) {
    if (!review.run_id) continue;
    (map[review.run_id] ??= []).push(...review.findings);
  }
  return map;
}
