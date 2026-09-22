import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

import { PRRow } from "./PRRow";

afterEach(() => {
  cleanup();
  push.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const BASE: PrMeta = {
  number: 482,
  title: "Add rate limiting to public API endpoints",
  author: "marisa.koch",
  branch: "feat/rate-limit-public",
  base: "main",
  head_sha: "sha",
  additions: 200,
  deletions: 47,
  files_count: 9,
  status: "needs_review",
};

const PREVIEW_FINDING = {
  id: "f1",
  severity: "CRITICAL" as const,
  category: "security" as const,
  title: "Hardcoded Stripe secret key in commit",
  file: "src/config.ts",
  start_line: 12,
  confidence: 0.98,
  rationale: "Line 12 contains a literal sk_live_ Stripe key.",
};

describe("PRRow FINDINGS cell", () => {
  it("shows severity icons only for severities present in the latest review", () => {
    const pr: PrMeta = {
      ...BASE,
      findings: { critical: 1, warning: 4, suggestion: 0 },
      findings_preview: [PREVIEW_FINDING],
    };
    const { container } = renderWithIntl(<PRRow pr={pr} repoId="repo1" />);

    // Two icons rendered (critical + warning), none for suggestion (count 0).
    const icons = container.querySelectorAll("svg.lucide-octagon-alert, svg.lucide-triangle-alert, svg.lucide-lightbulb");
    expect(icons).toHaveLength(2);
  });

  it("renders — when the PR has no review yet", () => {
    const pr: PrMeta = { ...BASE, findings: null, findings_preview: null };
    renderWithIntl(<PRRow pr={pr} repoId="repo1" />);
    // Both SCORE and FINDINGS cells render "—" when unreviewed; assert at least one.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("hovering reveals the popover header and a read-only preview with no buttons, portaled to document.body", () => {
    const pr: PrMeta = {
      ...BASE,
      findings: { critical: 1, warning: 0, suggestion: 0 },
      findings_preview: [PREVIEW_FINDING],
    };
    const { container } = renderWithIntl(<PRRow pr={pr} repoId="repo1" />);

    // The popover trigger is the only tabIndex=0 element in the row.
    const trigger = container.querySelector('[tabindex="0"]') as HTMLElement;
    fireEvent.mouseEnter(trigger);

    const header = screen.getByText("1 FINDINGS IN THIS RUN");
    expect(header).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("98% conf")).toBeInTheDocument();

    // The panel is portaled to document.body — NOT a descendant of the row's
    // own container (that's what escapes tableCard's overflow:hidden clip).
    expect(container.contains(header)).toBe(false);
    expect(document.body.contains(header)).toBe(true);

    // Criterion 21: the popover preview is read-only — no buttons at all.
    // Scoped to the panel itself (its nearest fixed-position ancestor), not
    // the whole document, since the panel now lives outside `container`.
    const panel = header.closest('div[style*="position: fixed"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.querySelectorAll("button")).toHaveLength(0);
  });

  it("clicking inside the popover does not navigate to the PR (stopPropagation)", () => {
    const pr: PrMeta = {
      ...BASE,
      findings: { critical: 1, warning: 0, suggestion: 0 },
      findings_preview: [PREVIEW_FINDING],
    };
    renderWithIntl(<PRRow pr={pr} repoId="repo1" />);

    const el = document.querySelector('[tabindex="0"]') as HTMLElement;
    fireEvent.mouseEnter(el);
    fireEvent.click(screen.getByText("Hardcoded Stripe secret key in commit"));

    expect(push).not.toHaveBeenCalled();
  });
});
