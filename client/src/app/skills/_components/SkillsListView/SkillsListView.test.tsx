import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import commonMessages from "../../../../../messages/en/common.json";
import { ToastProvider } from "../../../../lib/toast";

const createMutate = vi.hoisted(() => vi.fn());

const push = vi.hoisted(() => vi.fn());
const updateMutate = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: updateMutate }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSkill: () => ({ mutate: createMutate, isPending: false, isError: false }),
}));

import { SkillsListView } from "./SkillsListView";

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "Branch Coverage Rubric",
    description: "Flags uncovered branches",
    type: "rubric",
    source: "manual",
    body: "# Rubric",
    enabled: true,
    version: 1,
  },
  {
    id: "sk2",
    name: "Mock Discipline",
    description: "Flags over-mocking",
    type: "convention",
    source: "extracted",
    body: "# Convention",
    enabled: false,
    version: 2,
  },
];

afterEach(() => {
  cleanup();
  push.mockReset();
  updateMutate.mockReset();
});

function ui() {
  return (
    <NextIntlClientProvider locale="en" messages={{ skills: messages, common: commonMessages }}>
      <ToastProvider>
        <SkillsListView />
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

describe("SkillsListView", () => {
  it("renders a card per skill with its type and source badges", () => {
    render(ui());
    expect(screen.getByText("Branch Coverage Rubric")).toBeInTheDocument();
    expect(screen.getByText("Mock Discipline")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Extracted")).toBeInTheDocument();
  });

  it("filters cards by the search box", () => {
    render(ui());
    fireEvent.change(screen.getByPlaceholderText("Search skills…"), { target: { value: "mock" } });
    expect(screen.queryByText("Branch Coverage Rubric")).toBeNull();
    expect(screen.getByText("Mock Discipline")).toBeInTheDocument();
  });

  it("toggles a skill's enabled state via useUpdateSkill", () => {
    render(ui());
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]!);
    expect(updateMutate).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } });
  });
});

describe("SkillsListView — preview panel and create", () => {
  it("clicking a card opens a side-panel preview with the rendered body; Open editor goes to /skills/:id", () => {
    render(ui());
    fireEvent.click(screen.getByText("Branch Coverage Rubric"));

    const panel = screen.getByRole("dialog");
    expect(within(panel).getByRole("heading", { name: "Rubric" })).toBeInTheDocument(); // "# Rubric" rendered, not raw
    fireEvent.click(within(panel).getByRole("button", { name: "Open editor" }));
    expect(push).toHaveBeenCalledWith("/skills/sk1?tab=config");
  });

  it("Add Skill → Create skill opens a modal and creates a manual skill", () => {
    render(ui());
    fireEvent.click(screen.getByText("Add Skill"));
    fireEvent.click(screen.getByText("Create skill"));

    const modal = screen.getByRole("dialog");
    const create = within(modal).getByRole("button", { name: "Create skill" });
    expect(create).toBeDisabled();
    fireEvent.change(within(modal).getByPlaceholderText("e.g. breaking-change"), { target: { value: " response-schema " } });
    fireEvent.change(within(modal).getByPlaceholderText("What this skill checks — one directive sentence"), {
      target: { value: "Require a zod schema on every route." },
    });
    fireEvent.change(modal.querySelector("textarea")!, { target: { value: "# Response schema\nValidate input." } });
    fireEvent.click(create);

    expect(createMutate.mock.calls[0]![0]).toEqual({
      name: "response-schema",
      description: "Require a zod schema on every route.",
      type: "custom",
      body: "# Response schema\nValidate input.",
      enabled: true,
      source: "manual",
    });
  });
});
