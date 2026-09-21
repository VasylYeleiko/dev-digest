import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const AGENTS = [
  { id: "a1", name: "Security Reviewer", model: "deepseek/deepseek-v4-flash", enabled: true },
  { id: "a2", name: "Performance Reviewer", model: "deepseek/deepseek-v4-flash", enabled: true },
  { id: "a3", name: "Style Reviewer", model: "gpt-4.1", enabled: false },
];
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: AGENTS }),
}));

const mutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({ pr_id: "pr1", runs: [], reviews: [] }));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync, isPending: false }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(() => {
  cleanup();
  push.mockClear();
  mutateAsync.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function openMenu() {
  fireEvent.click(screen.getByText("Run Review"));
}

describe("RunReviewDropdown (smoke)", () => {
  it("renders the trigger label", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });
});

describe("RunReviewDropdown multi-select", () => {
  it("opening the menu renders one checkbox per agent, unchecked by default", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openMenu();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    for (const cb of checkboxes) expect(cb).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Performance Reviewer")).toBeInTheDocument();
  });

  it("no 'Run selected' button until at least one agent is checked", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openMenu();
    expect(screen.queryByText(/Run selected/)).not.toBeInTheDocument();
  });

  it("checking two agents then clicking 'Run selected' runs exactly those two, staying open across checks", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openMenu();

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!); // Security Reviewer (a1)
    // The menu must still be open after the first check — a checkbox click
    // must not behave like the old immediate-run item click.
    expect(screen.getByText("Performance Reviewer")).toBeInTheDocument();
    fireEvent.click(checkboxes[1]!); // Performance Reviewer (a2)

    fireEvent.click(screen.getByText("Run selected (2)"));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1", "a2"] });
  });

  it("'Run all enabled agents' still fires immediately with {all: true}, unaffected by selection", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openMenu();

    fireEvent.click(screen.getByText("Run all enabled agents"));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", all: true });
  });
});
