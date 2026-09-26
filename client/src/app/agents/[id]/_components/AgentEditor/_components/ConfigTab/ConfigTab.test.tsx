import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { ConfigTab } from "./ConfigTab";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function ui(agent: Agent) {
  return (
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>
        <ConfigTab key={agent.id} agent={agent} />
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

describe("ConfigTab form", () => {
  it("saves the edited fields as a wire-shaped patch", () => {
    render(ui(AGENT));
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Sec v2" } });
    fireEvent.click(screen.getByText("Save agent"));

    expect(mutate).toHaveBeenCalledTimes(1);
    const { id, patch } = mutate.mock.calls[0]![0] as { id: string; patch: Record<string, unknown> };
    expect(id).toBe("ag1");
    expect(patch).toEqual({
      name: "Sec v2",
      description: "Flags secrets and injection",
      provider: "openai",
      model: "gpt-4.1",
      system_prompt: "You are a security reviewer.",
      strategy: "single-pass",
      ci_fail_on: "critical",
      repo_intel: true,
      enabled: true,
    });
  });

  it("switching to another agent resets the form to that agent", () => {
    const { rerender } = render(ui(AGENT));
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "unsaved edit" } });

    rerender(ui({ ...AGENT, id: "ag2", name: "Perf Reviewer" }));

    expect(screen.queryByDisplayValue("unsaved edit")).toBeNull();
    expect(screen.getByDisplayValue("Perf Reviewer")).toBeInTheDocument();
  });
});
