import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);

const f = (id: string, severity: string) =>
  ({
    id, severity, category: "bug", title: `t-${id}`, file: "a.ts", start_line: 1, end_line: 1,
    rationale: "r", suggestion: null, confidence: 0.9, kind: "finding", trifecta_components: null,
    evidence: null, review_id: "rv", accepted_at: null, dismissed_at: null,
  }) as FindingRecord;

function renderRun(findings: FindingRecord[]) {
  const review = {
    id: "rv", run_id: "run1", agent_name: "Security", verdict: "request_changes", summary: "s",
    score: 40, created_at: "2026-01-01T00:00:00Z", findings,
  } as unknown as ReviewRecord;
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview }}>
      <ReviewRunAccordion review={review} prId="pr1" />
    </NextIntlClientProvider>,
  );
}

describe("ReviewRunAccordion header", () => {
  // The e2e flow 04-pr-findings waits for exactly "request changes" and "2 findings".
  it("shows the verdict and a pluralised finding count", () => {
    renderRun([f("a", "WARNING"), f("b", "SUGGESTION")]);
    expect(screen.getByText("request changes")).toBeInTheDocument();
    expect(screen.getByText(/^2 findings$/)).toBeInTheDocument();
  });

  it("singular forms and the blocker suffix", () => {
    renderRun([f("a", "CRITICAL")]);
    expect(screen.getByText("1 finding · 1 blocker")).toBeInTheDocument();
  });
});
