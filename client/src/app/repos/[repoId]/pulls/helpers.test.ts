import { describe, it, expect, vi, afterEach } from "vitest";
import type { PrMeta } from "./constants";
import { filterAndSortPulls, pullCounts, relativeTime, sizeOf } from "./helpers";

const pr = (p: Partial<PrMeta>) =>
  ({ number: 1, title: "t", status: "needs_review", updated_at: null, additions: 0, deletions: 0, ...p }) as PrMeta;

afterEach(() => vi.useRealTimers());

describe("PR list helpers", () => {
  const pulls = [
    pr({ number: 1, title: "Fix login", status: "needs_review", updated_at: "2026-01-01T00:00:00Z" }),
    pr({ number: 2, title: "Add cache", status: "reviewed", updated_at: "2026-01-03T00:00:00Z" }),
    pr({ number: 3, title: "Old one", status: "merged", updated_at: "2026-01-02T00:00:00Z" }),
  ];

  it("filters by status chip and text, newest first by default", () => {
    expect(filterAndSortPulls(pulls, { status: "all", query: "", sort: "newest" }).map((p) => p.number)).toEqual([2, 3, 1]);
    expect(filterAndSortPulls(pulls, { status: "reviewed", query: "", sort: "newest" }).map((p) => p.number)).toEqual([2]);
    expect(filterAndSortPulls(pulls, { status: "all", query: " LOGIN ", sort: "newest" }).map((p) => p.number)).toEqual([1]);
    expect(filterAndSortPulls(pulls, { status: "all", query: "3", sort: "newest" }).map((p) => p.number)).toEqual([3]);
  });

  it("sorts oldest first on request and never mutates the input", () => {
    const before = pulls.map((p) => p.number);
    expect(filterAndSortPulls(pulls, { status: "all", query: "", sort: "oldest" }).map((p) => p.number)).toEqual([1, 3, 2]);
    expect(pulls.map((p) => p.number)).toEqual(before);
  });

  it("counts open and needs-review PRs", () => {
    expect(pullCounts(pulls)).toEqual({ openCount: 2, needsReviewCount: 1 });
  });

  it("sizeOf buckets by changed lines; relativeTime is compact", () => {
    expect(sizeOf(pr({ additions: 10, deletions: 5 })).size).toBe("S");
    expect(sizeOf(pr({ additions: 300, deletions: 50 })).size).toBe("M");
    expect(sizeOf(pr({ additions: 500 })).size).toBe("L");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    expect(relativeTime("2026-01-01T22:00:00Z")).toBe("2h");
    expect(relativeTime(null)).toBe("—");
  });
});
