import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../lib/toast";

const importMutateAsync = vi.hoisted(() => vi.fn());
const createMutate = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("../../../../lib/hooks/skills", () => ({
  useImportSkill: () => ({ mutateAsync: importMutateAsync, isPending: false }),
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
}));

import { AddSkillDrawer } from "./AddSkillDrawer";

afterEach(() => {
  cleanup();
  importMutateAsync.mockReset();
  createMutate.mockReset();
  push.mockReset();
});

function ui(onClose = () => {}) {
  return (
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <AddSkillDrawer onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

describe("AddSkillDrawer", () => {
  it("imports a file, previews it, and saves it as an extracted skill", async () => {
    importMutateAsync.mockResolvedValue({
      name: "pr-quality-rubric",
      description: "A rubric",
      type: "rubric",
      body: "# Rule\nDo the thing.",
      source: "extracted",
    });
    const onClose = vi.fn();
    render(ui(onClose));

    const file = new File(["# Rule\nDo the thing."], "pr-quality-rubric.md", { type: "text/markdown" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(importMutateAsync).toHaveBeenCalledTimes(1));
    expect(await screen.findByDisplayValue("pr-quality-rubric")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Save"));
    expect(createMutate).toHaveBeenCalledTimes(1);
    const [patch] = createMutate.mock.calls[0]!;
    expect(patch).toEqual({
      name: "pr-quality-rubric",
      description: "A rubric",
      type: "rubric",
      body: "# Rule\nDo the thing.",
      source: "extracted",
    });
  });

  it("renders URL and Community tabs with disabled controls", () => {
    render(ui());
    fireEvent.click(screen.getByText("From URL"));
    expect(screen.getByText("Import from URL")).toBeDisabled();

    fireEvent.click(screen.getByText("Community"));
    expect(screen.getByText("Search community skills (e.g. security)…")).toBeInTheDocument();
  });
});
