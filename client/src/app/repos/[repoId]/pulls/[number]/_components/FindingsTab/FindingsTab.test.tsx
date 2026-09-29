import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import prReview from "../../../../../../../../messages/en/prReview.json";

// The tab owns its run data through these hooks — mock them per test.
const h = vi.hoisted(() => ({
  reviews: [] as unknown[],
  activeRuns: [] as { run_id: string }[],
  cancel: vi.fn(),
  del: vi.fn(),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: h.reviews, refetch: vi.fn() }),
  usePrActiveRuns: () => ({ data: h.activeRuns }),
  usePrRuns: () => ({ data: [] }),
  useCancelRun: () => ({ mutate: h.cancel, isPending: false }),
  useDeleteRun: () => ({ mutate: h.del }),
  useInvalidateRunState: () => ({ activeRuns: vi.fn(), history: vi.fn() }),
  // RunStatus (rendered while runs are live) subscribes to SSE through this.
  useRunEvents: () => ({ events: [], running: true }),
}));

import { FindingsTab } from "./FindingsTab";

afterEach(() => {
  cleanup();
  h.reviews = [];
  h.activeRuns = [];
  h.cancel.mockClear();
  h.del.mockClear();
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview }}>
      <FindingsTab prId="pr1" prCommits={[]} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("FindingsTab", () => {
  it("shows the empty state when there are no reviews and nothing is running", () => {
    renderTab();
    expect(screen.getByText("No findings yet")).toBeInTheDocument();
  });

  it("Cancel stops every live run", () => {
    h.activeRuns = [{ run_id: "r1" }, { run_id: "r2" }];
    renderTab();
    expect(screen.queryByText("No findings yet")).toBeNull();
    fireEvent.click(screen.getByText("Cancel"));
    expect(h.cancel.mock.calls.map((c) => c[0])).toEqual(["r1", "r2"]);
  });
});
