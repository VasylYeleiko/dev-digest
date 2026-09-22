/**
 * PR-list rollup helpers (`modules/pulls/status.ts`) — the pure derivation that
 * decides each PR's review STATUS, tallies its FINDINGS, previews them for the
 * row popover, and sums its COST for the list. The DB `status` column holds
 * GitHub's merge state; the review status (needs_review / reviewed / stale) is
 * derived here from head vs lastReviewedSha + age, so it gets unit coverage
 * independent of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveReviewStatus,
  rollupSeverities,
  rollupCostByPr,
  previewFindings,
  STALE_DAYS,
} from '../src/modules/pulls/status.js';

const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 11);

describe('deriveReviewStatus', () => {
  it('needs_review when never reviewed, or when head moved since the last review', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: null, headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'old', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
  });

  it('reviewed when the current head was reviewed and the PR is recent', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now - DAY), now }),
    ).toBe('reviewed');
  });

  it('stale when the current head was reviewed but the PR is older than STALE_DAYS', () => {
    expect(
      deriveReviewStatus({
        ghStatus: 'open',
        lastReviewedSha: 'abc',
        headSha: 'abc',
        updatedAt: new Date(now - (STALE_DAYS + 1) * DAY),
        now,
      }),
    ).toBe('stale');
  });

  it('keeps merged/closed regardless of review state', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'merged', lastReviewedSha: null, headSha: 'abc', updatedAt: null, now }),
    ).toBe('merged');
    expect(
      deriveReviewStatus({ ghStatus: 'closed', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('closed');
  });
});

describe('rollupSeverities', () => {
  it('tallies findings into critical / warning / suggestion buckets (ignores unknown)', () => {
    expect(
      rollupSeverities([
        { severity: 'CRITICAL' },
        { severity: 'CRITICAL' },
        { severity: 'WARNING' },
        { severity: 'SUGGESTION' },
        { severity: 'WEIRD' },
      ]),
    ).toEqual({ critical: 2, warning: 1, suggestion: 1 });
  });

  it('is all-zero for no findings', () => {
    expect(rollupSeverities([])).toEqual({ critical: 0, warning: 0, suggestion: 0 });
  });
});

describe('rollupCostByPr', () => {
  it('sums every run for a PR regardless of timestamps (no batch window)', () => {
    // No `ranAt` field at all in the input — the helper physically cannot
    // window by time, which is the proof the 120s batch window is gone.
    const map = rollupCostByPr([
      { prId: 'pr1', costUsd: 0.001 },
      { prId: 'pr1', costUsd: 0.002 },
      { prId: 'pr1', costUsd: 0.003 },
    ]);
    expect(map.get('pr1')).toBeCloseTo(0.006, 10);
  });

  it('groups two PRs independently and skips prId=null / costUsd=null rows', () => {
    const map = rollupCostByPr([
      { prId: 'pr1', costUsd: 0.01 },
      { prId: 'pr2', costUsd: 0.02 },
      { prId: null, costUsd: 0.5 },
      { prId: 'pr1', costUsd: null },
    ]);
    expect(map.get('pr1')).toBeCloseTo(0.01, 10);
    expect(map.get('pr2')).toBeCloseTo(0.02, 10);
    expect(map.size).toBe(2);
  });

  it('a PR whose runs are all unpriced gets NO entry (→ null → "—", never "$0.00")', () => {
    const map = rollupCostByPr([
      { prId: 'pr1', costUsd: null },
      { prId: 'pr1', costUsd: null },
    ]);
    expect(map.has('pr1')).toBe(false);
  });

  it('a genuine $0 run DOES get an entry (free model → "$0.00", not "—")', () => {
    const map = rollupCostByPr([{ prId: 'pr1', costUsd: 0 }]);
    expect(map.get('pr1')).toBe(0);
    expect(map.has('pr1')).toBe(true);
  });
});

describe('previewFindings', () => {
  const f = (severity: string, confidence: number, id: string) => ({ id, severity, confidence });

  it('sorts severity-first, then confidence-desc within a severity', () => {
    const out = previewFindings([
      f('SUGGESTION', 0.9, 'sugg'),
      f('CRITICAL', 0.6, 'crit-low'),
      f('WARNING', 0.9, 'warn'),
      f('CRITICAL', 0.95, 'crit-high'),
    ]);
    expect(out.map((r) => r.id)).toEqual(['crit-high', 'crit-low', 'warn', 'sugg']);
  });

  it('honours the cap', () => {
    const rows = Array.from({ length: 15 }, (_, i) => f('WARNING', 0.5, `f${i}`));
    expect(previewFindings(rows, 5)).toHaveLength(5);
  });

  it('is empty in, empty out', () => {
    expect(previewFindings([])).toEqual([]);
  });
});
