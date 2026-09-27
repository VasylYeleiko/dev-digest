import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, ConventionSkillDraft } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ToastProvider } from "../../../../../../lib/toast";

const createMutate = vi.hoisted(() => vi.fn());
const draftState = vi.hoisted(() => ({ current: {} as { data?: unknown; isError?: boolean } }));

vi.mock("../../../../../../lib/hooks/conventions", () => ({
  useConventionSkillDraft: () => draftState.current,
  useCreateConventionsSkill: () => ({ mutateAsync: createMutate, isPending: false, isError: false }),
}));
vi.mock("../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: AGENTS }),
}));

import { CreateConventionsSkillModal } from "./CreateConventionsSkillModal";

const DRAFT: ConventionSkillDraft = {
  name: "repo-conventions",
  description: "2 house conventions extracted from acme/payments-api",
  type: "convention",
  body: "# repo-conventions\n\n## Async\n\n### Always use async/await",
  convention_ids: ["c1", "c2"],
  existing_skill_id: null,
};

const agent = (id: string, name: string, enabled: boolean): Agent => ({
  id,
  name,
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "",
  enabled,
  version: 1,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
});
const AGENTS: Agent[] = [agent("a0", "Disabled Reviewer", false), agent("a1", "General Reviewer", true), agent("a2", "Security Reviewer", true)];

afterEach(() => {
  cleanup();
  createMutate.mockReset();
});

function renderModal(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ToastProvider>
        <CreateConventionsSkillModal
          repoId="r1"
          repoName="acme/payments-api"
          conventionIds={["c1", "c2"]}
          onClose={onClose}
        />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return onClose;
}

describe("CreateConventionsSkillModal", () => {
  it("prefills the merged draft, lets the body and metadata be edited, and creates + links", async () => {
    draftState.current = { data: DRAFT };
    createMutate.mockResolvedValue({
      skill: { id: "s1", name: "repo-conventions", version: 1 },
      created: true,
      linked_agent_ids: ["a1", "a2"],
    });
    const onClose = renderModal();

    expect(screen.getByText("Create skill from conventions")).toBeInTheDocument();
    expect(screen.getByText(/Merged from 2 accepted conventions in acme\/payments-api/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("repo-conventions")).toBeInTheDocument();
    expect(screen.getByText("Saved as v1 · added to Skills Lab")).toBeInTheDocument();
    // First ENABLED agent is pre-selected.
    expect(screen.getByRole("checkbox", { name: /General Reviewer/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: /Security Reviewer/ })).toHaveAttribute("aria-checked", "false");

    fireEvent.change(screen.getByDisplayValue(/## Async/), { target: { value: "# repo-conventions\n\nEdited." } });
    fireEvent.change(screen.getByDisplayValue(DRAFT.description), { target: { value: "House rules" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Security Reviewer/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith({
        name: "repo-conventions",
        description: "House rules",
        type: "convention",
        body: "# repo-conventions\n\nEdited.",
        enabled: true,
        convention_ids: ["c1", "c2"],
        agent_ids: ["a1", "a2"],
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await screen.findByText(/Created “repo-conventions” and linked it to 2 agents/)).toBeInTheDocument();
  });

  it("blocks Create for a disabled skill with agents, and warns when it will version an existing skill", () => {
    draftState.current = { data: { ...DRAFT, existing_skill_id: "s-old" } };
    renderModal();
    expect(screen.getByText(/already exists — Create saves this as its next version/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("Enable the skill to link it to agents.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /General Reviewer/ }));
    expect(screen.getByRole("button", { name: "Create skill" })).toBeEnabled();
  });

  it("shows the draft error instead of the form", () => {
    draftState.current = { isError: true, error: new Error("Only accepted conventions of this repo can be merged") } as never;
    renderModal();
    expect(screen.getByRole("alert")).toHaveTextContent("Only accepted conventions");
    expect(screen.queryByRole("button", { name: "Create skill" })).toBeNull();
  });
});
