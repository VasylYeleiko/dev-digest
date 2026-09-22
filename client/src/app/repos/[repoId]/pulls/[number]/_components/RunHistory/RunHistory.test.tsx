/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[], findingsByRun?: Record<string, FindingRecord[]>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} findingsByRun={findingsByRun} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    review_id: "review-1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Line 12 contains a literal sk_live_ Stripe key.",
    suggestion: null,
    confidence: 0.98,
    kind: null,
    trifecta_components: null,
    evidence: null,
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — cost badge", () => {
  it("a settled run shows total tokens · cost", () => {
    renderRuns([
      run({ status: "done", tokens_in: 9000, tokens_out: 119, cost_usd: 0.0013, score: 80 }),
    ]);
    expect(screen.getByText(/9,119 tok · \$0\.0013/)).toBeInTheDocument();
  });

  it("a settled run with no cost data shows '—', never '$0.00'", () => {
    renderRuns([run({ status: "done", tokens_in: 0, tokens_out: 0, cost_usd: null, score: 80 })]);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it("a running run shows no cost line at all", () => {
    renderRuns([
      run({ status: "running", tokens_in: 9000, tokens_out: 119, cost_usd: 0.0013, score: null }),
    ]);
    expect(screen.queryByText(/tok ·/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — findings popover", () => {
  it("with findingsByRun, renders severity icons instead of the 'N finding(s)' text", () => {
    const r = run({ run_id: "run-a", status: "done", findings_count: 2, blockers: 0, score: 72 });
    const { container } = renderRuns(
      [r],
      { "run-a": [finding({ id: "f1", severity: "CRITICAL" }), finding({ id: "f2", severity: "WARNING" })] },
    );

    expect(screen.queryByText("2 finding(s)")).not.toBeInTheDocument();
    const icons = container.querySelectorAll("svg.lucide-octagon-alert, svg.lucide-triangle-alert");
    expect(icons).toHaveLength(2);
  });

  it("a run missing from findingsByRun falls back to the 'N finding(s)' text", () => {
    renderRuns([run({ run_id: "run-b", status: "done", findings_count: 4, blockers: 0, score: 90 })], {});
    expect(screen.getByText("4 finding(s)")).toBeInTheDocument();
  });

  it("a 0-finding run still reads '0 finding(s)', never icons", () => {
    renderRuns(
      [run({ run_id: "run-c", status: "done", findings_count: 0, blockers: 0, score: 100 })],
      { "run-c": [] },
    );
    expect(screen.getByText("0 finding(s)")).toBeInTheDocument();
  });

  it("blockers text still renders next to the icons", () => {
    const r = run({ run_id: "run-d", status: "done", findings_count: 1, blockers: 1, score: 20 });
    renderRuns([r], { "run-d": [finding({ id: "f1", severity: "CRITICAL" })] });
    expect(screen.getByText(/1 blockers/)).toBeInTheDocument();
  });

  it("hovering the icons opens a portaled panel scoped to that run's findings", () => {
    const r = run({ run_id: "run-e", status: "done", findings_count: 1, blockers: 0, score: 61 });
    const { container } = renderRuns([r], { "run-e": [finding({ id: "f1" })] });

    const trigger = container.querySelector('[tabindex="0"]') as HTMLElement;
    fireEvent.mouseEnter(trigger);

    const header = screen.getByText("1 FINDINGS IN THIS RUN");
    expect(header).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("98% conf")).toBeInTheDocument();

    // Portaled to document.body, per client/INSIGHTS.md — escapes any
    // overflow:hidden ancestor.
    expect(container.contains(header)).toBe(false);
    expect(document.body.contains(header)).toBe(true);
  });
});
