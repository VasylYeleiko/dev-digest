import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
}));

import { ConfigTab } from "./ConfigTab";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

const SKILL: Skill = {
  id: "sk1",
  name: "Branch Coverage Rubric",
  description: "Flags uncovered branches",
  type: "rubric",
  source: "manual",
  body: "# Rule\nCover every branch.",
  enabled: true,
  version: 1,
};

function ui(skill: Skill) {
  return (
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ConfigTab key={skill.id} skill={skill} />
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

describe("Skill ConfigTab", () => {
  it("shows a live token counter derived from the body length", () => {
    render(ui(SKILL));
    // approxTokens = Math.ceil(len/4); SKILL.body.length === 26 -> 7
    expect(screen.getByText(/~7 tokens/)).toBeInTheDocument();
  });

  it("marks the form dirty until saved, and saves a wire-shaped patch", () => {
    render(ui(SKILL));
    expect(screen.queryByText("Unsaved changes")).toBeNull();

    fireEvent.change(screen.getByDisplayValue("Branch Coverage Rubric"), { target: { value: "Branch Coverage v2" } });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Save skill"));
    expect(mutate).toHaveBeenCalledTimes(1);
    const { id, patch } = mutate.mock.calls[0]![0] as { id: string; patch: Record<string, unknown> };
    expect(id).toBe("sk1");
    expect(patch).toEqual({
      name: "Branch Coverage v2",
      description: "Flags uncovered branches",
      type: "rubric",
      body: "# Rule\nCover every branch.",
      enabled: true,
    });
  });

  it("switching to another skill resets the form to that skill", () => {
    const { rerender } = render(ui(SKILL));
    fireEvent.change(screen.getByDisplayValue("Branch Coverage Rubric"), { target: { value: "unsaved edit" } });

    rerender(ui({ ...SKILL, id: "sk2", name: "Mock Discipline" }));

    expect(screen.queryByDisplayValue("unsaved edit")).toBeNull();
    expect(screen.getByDisplayValue("Mock Discipline")).toBeInTheDocument();
  });
});
