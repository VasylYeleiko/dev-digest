import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { FindingsPopover, type FindingsCounts, type FindingsPreviewItem } from "./FindingsPopover";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const COUNTS: FindingsCounts = { critical: 1, warning: 0, suggestion: 0 };
const PREVIEW: FindingsPreviewItem[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    confidence: 0.98,
    rationale: "Line 12 contains a literal sk_live_ Stripe key.",
  },
];

function trigger(container: HTMLElement) {
  return container.querySelector('[tabindex="0"]') as HTMLElement;
}

describe("FindingsPopover — zero state", () => {
  it("renders the default muted dash when there are no findings", () => {
    renderWithIntl(<FindingsPopover counts={null} preview={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders a caller-supplied zeroState instead of the dash", () => {
    renderWithIntl(
      <FindingsPopover
        counts={{ critical: 0, warning: 0, suggestion: 0 }}
        preview={[]}
        zeroState={<span>0 finding(s)</span>}
      />,
    );
    expect(screen.getByText("0 finding(s)")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});

describe("FindingsPopover — hover", () => {
  it("mouseenter opens the panel, mouseleave closes it", () => {
    const { container } = renderWithIntl(<FindingsPopover counts={COUNTS} preview={PREVIEW} />);
    const el = trigger(container);

    fireEvent.mouseEnter(el);
    expect(screen.getByText("1 FINDINGS IN THIS RUN")).toBeInTheDocument();

    fireEvent.mouseLeave(el);
    expect(screen.queryByText("1 FINDINGS IN THIS RUN")).not.toBeInTheDocument();
  });
});

describe("FindingsPopover — click to pin", () => {
  it("click opens the panel and keeps it open after mouseleave", () => {
    const { container } = renderWithIntl(<FindingsPopover counts={COUNTS} preview={PREVIEW} />);
    const el = trigger(container);

    fireEvent.click(el);
    expect(screen.getByText("1 FINDINGS IN THIS RUN")).toBeInTheDocument();

    fireEvent.mouseLeave(el);
    expect(screen.getByText("1 FINDINGS IN THIS RUN")).toBeInTheDocument();
  });

  it("a pointerdown outside the trigger and panel unpins it", () => {
    const { container } = renderWithIntl(<FindingsPopover counts={COUNTS} preview={PREVIEW} />);
    fireEvent.click(trigger(container));
    expect(screen.getByText("1 FINDINGS IN THIS RUN")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("1 FINDINGS IN THIS RUN")).not.toBeInTheDocument();
  });

  it("Escape unpins the panel", () => {
    const { container } = renderWithIntl(<FindingsPopover counts={COUNTS} preview={PREVIEW} />);
    fireEvent.click(trigger(container));
    expect(screen.getByText("1 FINDINGS IN THIS RUN")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("1 FINDINGS IN THIS RUN")).not.toBeInTheDocument();
  });

  it("clicking a second time unpins (toggle)", () => {
    const { container } = renderWithIntl(<FindingsPopover counts={COUNTS} preview={PREVIEW} />);
    const el = trigger(container);

    fireEvent.click(el);
    expect(screen.getByText("1 FINDINGS IN THIS RUN")).toBeInTheDocument();

    fireEvent.click(el);
    expect(screen.queryByText("1 FINDINGS IN THIS RUN")).not.toBeInTheDocument();
  });
});
