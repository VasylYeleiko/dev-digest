import { describe, it, expect } from "vitest";
import type { PrCommit, RunSummary } from "@devdigest/shared";
import { buildTimeline, outcomeOf, tsOf } from "./helpers";

function run(p: Partial<RunSummary>): RunSummary {
  return { run_id: "r", status: "done", blockers: 0, findings_count: 0, ran_at: null, ...p } as RunSummary;
}

describe("outcomeOf", () => {
  it("lifecycle states win over counts", () => {
    expect(outcomeOf(run({ status: "running", blockers: 3 })).key).toBe("running");
    expect(outcomeOf(run({ status: "failed" })).key).toBe("error");
    expect(outcomeOf(run({ status: "cancelled" })).key).toBe("cancelled");
  });

  it("a finished run with blockers is 'rejected', never a green outcome", () => {
    expect(outcomeOf(run({ blockers: 1, findings_count: 1 })).key).toBe("rejected");
  });

  it("findings without blockers → 'reviewed'; nothing → 'approved'", () => {
    expect(outcomeOf(run({ findings_count: 2 })).key).toBe("reviewed");
    expect(outcomeOf(run({})).key).toBe("approved");
  });
});

describe("timeline", () => {
  it("tsOf: missing / unparseable timestamps sort last (0)", () => {
    expect(tsOf(null)).toBe(0);
    expect(tsOf("not a date")).toBe(0);
    expect(tsOf("2026-01-01T00:00:00Z")).toBeGreaterThan(0);
  });

  it("interleaves runs and commits newest first", () => {
    const commits = [{ sha: "c1", committed_at: "2026-01-02T00:00:00Z" }] as PrCommit[];
    const runs = [
      run({ run_id: "old", ran_at: "2026-01-01T00:00:00Z" }),
      run({ run_id: "new", ran_at: "2026-01-03T00:00:00Z" }),
    ];
    const order = buildTimeline(runs, commits).map((i) => (i.kind === "run" ? i.run.run_id : i.commit.sha));
    expect(order).toEqual(["new", "c1", "old"]);
  });
});
