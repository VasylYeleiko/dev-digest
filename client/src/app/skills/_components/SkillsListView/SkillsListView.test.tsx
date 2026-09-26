import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

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
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillsListView />
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
