import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

// Hoisted so every call to useFindingAction() returns the SAME mock fn — a
// fresh vi.fn() per call (the old factory) can never be asserted on.
const mutate = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate, isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
  {
    id: "f2",
    severity: "CRITICAL",
    category: "bug",
    title: "Low-confidence critical",
    file: "src/other.ts",
    start_line: 5,
    end_line: 5,
    rationale: "Might be a false positive.",
    suggestion: null,
    confidence: 0.5, // below LOW_CONFIDENCE_THRESHOLD (0.65)
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
  {
    id: "f3",
    severity: "WARNING",
    category: "perf",
    title: "N+1 query",
    file: "src/users.ts",
    start_line: 45,
    end_line: 45,
    rationale: "Loop calls findMany once per user.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
  {
    id: "f4",
    severity: "SUGGESTION",
    category: "style",
    title: "Extract magic number",
    file: "src/middleware.ts",
    start_line: 28,
    end_line: 28,
    rationale: "3600 appears twice without explanation.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function findingIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-finding-id]")).map(
    (el) => el.getAttribute("data-finding-id")!,
  );
}

/**
 * A pill's count lives in a nested `.tnum` span, so its own direct text is
 * just the label ("Critical") — RTL's default text matcher only looks at a
 * node's OWN text nodes, not descendants, so "Critical" and "2" never merge
 * into one queryable string. Read the count off the label's sibling instead.
 */
function pillCount(group: HTMLElement, label: string): string | null {
  const badge = within(group).getByText(label);
  return badge.querySelector(".tnum")?.textContent ?? null;
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={[FINDINGS[0]!]} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel severity pills + filter (one merged, clickable row)", () => {
  it("pill count equals the number of rendered cards of that severity, and clicking the Critical pill hides the others", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);

    const group = screen.getByRole("group", { name: "Filter by severity" });
    expect(pillCount(group, "Critical")).toBe("2");

    fireEvent.click(screen.getByRole("button", { name: /Critical/ }));

    expect(findingIds(container).sort()).toEqual(["f1", "f2"]);
    expect(screen.queryByText("N+1 query")).not.toBeInTheDocument();
    expect(screen.queryByText("Extract magic number")).not.toBeInTheDocument();
  });

  it("counts ignore the hide-low-confidence toggle", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);

    fireEvent.click(screen.getByRole("switch"));
    // f2 (confidence .5) drops from the list...
    expect(screen.queryByText("Low-confidence critical")).not.toBeInTheDocument();
    // ...but the CRITICAL pill still tallies both.
    const group = screen.getByRole("group", { name: "Filter by severity" });
    expect(pillCount(group, "Critical")).toBe("2");
  });

  it("clicking the active pill again restores the full list", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);

    const criticalPill = screen.getByRole("button", { name: /Critical/ });
    fireEvent.click(criticalPill);
    expect(findingIds(container)).toHaveLength(2);

    fireEvent.click(criticalPill);
    expect(findingIds(container).sort()).toEqual(["f1", "f2", "f3", "f4"]);
  });

  it("aria-pressed reflects the active state", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);

    const criticalPill = screen.getByRole("button", { name: /Critical/ });
    expect(criticalPill).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(criticalPill);
    expect(criticalPill).toHaveAttribute("aria-pressed", "true");
  });

  it("a severity with zero findings renders NO pill at all (not a disabled/empty one)", () => {
    const noSuggestions = FINDINGS.filter((f) => f.severity !== "SUGGESTION");
    renderWithIntl(<FindingsPanel findings={noSuggestions} prId="pr1" />);

    expect(screen.queryByRole("button", { name: /Suggestion/ })).not.toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Filter by severity" });
    expect(within(group).getAllByRole("button")).toHaveLength(2); // Critical + Warning only
  });

  it("the whole row is omitted when there are no findings at all", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("group", { name: "Filter by severity" })).not.toBeInTheDocument();
  });

  it("clamps keyboard focus into the filtered list (j then filter then a)", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);

    // Move focus to the last (unfiltered) card — index 3, "Extract magic number".
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "j" });

    fireEvent.click(screen.getByRole("button", { name: /Critical/ }));

    fireEvent.keyDown(window, { key: "a" });

    expect(mutate).toHaveBeenCalledTimes(1);
    const call = mutate.mock.calls[0]![0] as { findingId: string; action: string; prId: string };
    expect(call.action).toBe("accept");
    expect(["f1", "f2"]).toContain(call.findingId);
  });
});

describe("FindingsPanel — keyboard shortcuts with several panels open", () => {
  // Two expanded review runs → two panels on one page (ReviewRunAccordion).
  function renderTwo() {
    return renderWithIntl(
      <>
        <div data-testid="run-a">
          <FindingsPanel findings={FINDINGS} prId="pr1" />
        </div>
        <div data-testid="run-b">
          <FindingsPanel findings={FINDINGS.map((f) => ({ ...f, id: `b-${f.id}` }))} prId="pr1" />
        </div>
      </>,
    );
  }

  it("one keypress acts in ONE panel, not in every open panel", () => {
    renderTwo();
    fireEvent.keyDown(window, { key: "a" });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect((mutate.mock.calls[0]![0] as { findingId: string }).findingId).toBe("f1");
  });

  it("clicking inside another panel moves the shortcuts there", () => {
    renderTwo();
    fireEvent.pointerDown(within(screen.getByTestId("run-b")).getAllByRole("button")[0]!);
    fireEvent.keyDown(window, { key: "d" });
    expect(mutate).toHaveBeenCalledTimes(1);
    const call = mutate.mock.calls[0]![0] as { findingId: string; action: string };
    expect(call.findingId).toBe("b-f1");
    expect(call.action).toBe("dismiss");
  });

  // (contentEditable is covered by the shared `isTextInput`; jsdom doesn't
  // implement `isContentEditable`, so it can't be exercised here.)
  it("ignores Ctrl/Cmd combos and typing in a text field", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    fireEvent.keyDown(window, { key: "d", metaKey: true });
    const field = document.createElement("textarea");
    document.body.appendChild(field);
    fireEvent.keyDown(field, { key: "a" });
    field.remove();
    expect(mutate).not.toHaveBeenCalled();
  });
});
