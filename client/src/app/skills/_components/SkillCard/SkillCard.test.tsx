import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skillsMessages from "../../../../../messages/en/skills.json";
import commonMessages from "../../../../../messages/en/common.json";

const deleteMutate = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/hooks/skills", () => ({
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { SkillCard } from "./SkillCard";

afterEach(() => {
  cleanup();
  deleteMutate.mockReset();
});

const SKILL: Skill = {
  id: "sk1",
  name: "breaking-change",
  description: "Flag any change that breaks an existing client.",
  type: "rubric",
  source: "manual",
  body: "# Breaking change",
  enabled: true,
  version: 3,
  agent_count: 2,
};

function renderCard(onClick = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages, common: commonMessages }}>
      <SkillCard sk={SKILL} onClick={onClick} onToggle={vi.fn()} />
    </NextIntlClientProvider>,
  );
  return onClick;
}

describe("SkillCard", () => {
  it("shows the current version and how many agents link the skill", () => {
    renderCard();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
  });

  it("asks for confirmation in a modal before deleting; Cancel keeps the skill", () => {
    const onClick = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Delete skill?");
    expect(dialog).toHaveTextContent("“breaking-change” will be deleted");
    expect(dialog).toHaveTextContent("unlinked from 2 agents");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteMutate).not.toHaveBeenCalled();
    // Clicks inside the modal never reach the card (which would open the preview).
    expect(onClick).not.toHaveBeenCalled();
  });

  it("deletes on confirm, and the ✕ closes the modal too", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("sk1", expect.anything());
  });
});
