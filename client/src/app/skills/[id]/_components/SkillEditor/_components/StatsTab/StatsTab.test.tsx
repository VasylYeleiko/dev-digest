import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillStats } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";

const STATS: SkillStats = {
  used_by: 3,
  agents: [{ id: "ag1", name: "Test Quality Reviewer" }],
  accept_rate: 0.5,
  findings_30d: 12,
  findings_by_category: [{ category: "coverage", count: 4 }],
};

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillStats: () => ({ data: STATS, isLoading: false }),
}));

import { StatsTab } from "./StatsTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "Branch Coverage Rubric",
  description: "Flags uncovered branches",
  type: "rubric",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 1,
};

describe("StatsTab", () => {
  it("renders real used-by/agents plus labeled approximate metrics and the pull-frequency placeholder", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <StatsTab skill={SKILL} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("3")).toBeInTheDocument(); // used_by
    expect(screen.getByText("50%")).toBeInTheDocument(); // accept_rate
    expect(screen.getByText("12")).toBeInTheDocument(); // findings_30d
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Across agents using this skill — an approximation, not per-skill attribution."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Test Quality Reviewer" })).toHaveAttribute("href", "/agents/ag1");
    expect(screen.getByText("coverage")).toBeInTheDocument();
  });
});
