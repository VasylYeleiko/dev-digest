import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../messages/en/skills.json";

const setSkillsMutate = vi.hoisted(() => vi.fn());

// sk1/sk2 linked+enabled, sk5 linked+DISABLED (already attached before it was
// disabled), sk3 unlinked+enabled, sk4 unlinked+DISABLED.
const SKILLS: Skill[] = [
  { id: "sk1", name: "Branch Coverage Rubric", description: "", type: "rubric", source: "manual", body: "#", enabled: true, version: 1 },
  { id: "sk2", name: "Mock Discipline", description: "", type: "convention", source: "manual", body: "#", enabled: true, version: 1 },
  { id: "sk3", name: "Corner Case Checklist", description: "", type: "convention", source: "manual", body: "#", enabled: true, version: 1 },
  { id: "sk4", name: "Legacy Security Gate", description: "", type: "security", source: "manual", body: "#", enabled: false, version: 1 },
  { id: "sk5", name: "Retired Convention", description: "", type: "convention", source: "manual", body: "#", enabled: false, version: 1 },
];
const LINKS: AgentSkillLink[] = [
  { agent_id: "ag1", skill_id: "sk2", order: 0 },
  { agent_id: "ag1", skill_id: "sk1", order: 1 },
  { agent_id: "ag1", skill_id: "sk5", order: 2 },
];

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgentSkills: () => ({ data: LINKS, isLoading: false }),
  useSetAgentSkills: () => ({ mutate: setSkillsMutate }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  setSkillsMutate.mockClear();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Test Quality Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You review PRs.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function ui() {
  return (
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>
  );
}

/** Linked rows (and only linked rows) are `draggable`. */
function draggableRows(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[draggable="true"]'));
}

describe("Agent Editor SkillsTab", () => {
  it("counts only linked+enabled skills, and orders linked-first (incl. a disabled-but-linked skill), then unlinked-enabled, then unlinked-disabled", () => {
    render(ui());
    // 2 enabled links (sk2, sk1) out of 5 skills total — sk5 is linked but disabled.
    expect(screen.getByText("2 of 5 enabled")).toBeInTheDocument();
    const names = screen.getAllByText(/Rubric|Discipline|Checklist|Gate|Retired/).map((el) => el.textContent);
    expect(names).toEqual([
      "Mock Discipline",
      "Branch Coverage Rubric",
      "Retired Convention",
      "Corner Case Checklist",
      "Legacy Security Gate",
    ]);
  });

  it("shows each skill's type chip", () => {
    render(ui());
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getAllByText("convention").length).toBeGreaterThan(0);
    expect(screen.getByText("security")).toBeInTheDocument();
  });

  it("checking an unlinked, enabled skill appends it to the ordered id list", () => {
    render(ui());
    const checkboxes = screen.getAllByRole("checkbox");
    // 4th row = Corner Case Checklist (unlinked, enabled)
    fireEvent.click(checkboxes[3]!);
    expect(setSkillsMutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["sk2", "sk1", "sk5", "sk3"] });
  });

  it("clicking an unlinked, disabled skill's checkbox is a no-op", () => {
    render(ui());
    const checkboxes = screen.getAllByRole("checkbox");
    // 5th row = Legacy Security Gate (unlinked, disabled)
    fireEvent.click(checkboxes[4]!);
    expect(setSkillsMutate).not.toHaveBeenCalled();
  });

  it("unchecking a linked, enabled skill removes it from the ordered id list", () => {
    render(ui());
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!); // Mock Discipline (linked, first)
    expect(setSkillsMutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["sk1", "sk5"] });
  });

  it("unchecking a linked, disabled skill still detaches it (disabled only blocks attaching, not detaching)", () => {
    render(ui());
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[2]!); // Retired Convention (linked, disabled, 3rd row)
    expect(setSkillsMutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["sk2", "sk1"] });
  });

  it("shows a Disabled badge on a disabled skill, linked or not", () => {
    render(ui());
    expect(screen.getAllByText("Disabled")).toHaveLength(2); // Retired Convention + Legacy Security Gate
  });

  it("dragging a linked skill onto another linked skill reorders and replaces the whole set", () => {
    const { container } = render(ui());
    const rows = draggableRows(container);
    expect(rows).toHaveLength(3); // sk2, sk1, sk5 — the 3 linked rows
    fireEvent.dragStart(rows[0]!); // Mock Discipline (sk2)
    fireEvent.dragOver(rows[1]!); // over Branch Coverage Rubric (sk1)
    fireEvent.drop(rows[1]!);
    expect(setSkillsMutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["sk1", "sk2", "sk5"] });
  });

  it("does not fire a mutation when a drag is dropped back on its own row", () => {
    const { container } = render(ui());
    const rows = draggableRows(container);
    fireEvent.dragStart(rows[0]!);
    fireEvent.dragOver(rows[0]!);
    fireEvent.drop(rows[0]!);
    expect(setSkillsMutate).not.toHaveBeenCalled();
  });
});
