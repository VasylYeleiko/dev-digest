import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const mutate = vi.hoisted(() => vi.fn());
// Newest-first, matching the server's `ORDER BY version DESC` — v1 has no
// predecessor, so it gets no Diff button; v2's Diff compares v1→v2, v3's
// compares v2→v3.
const VERSIONS: SkillVersion[] = [
  { skill_id: "sk1", version: 3, body: "# Rule\nNew text.\nExtra line.", created_at: "2026-09-26T00:00:00.000Z" },
  { skill_id: "sk1", version: 2, body: "# Rule\nOld text.\nExtra line.", created_at: "2026-09-24T00:00:00.000Z" },
  { skill_id: "sk1", version: 1, body: "# Rule\nOld text.", created_at: "2026-09-20T00:00:00.000Z" },
];

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false }),
  useUpdateSkill: () => ({ mutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

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
  body: "# Rule\nNew text.\nExtra line.",
  enabled: true,
  version: 3,
};

function ui() {
  return (
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <VersionsTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

describe("VersionsTab", () => {
  it("marks the latest version Current and only offers Restore on past versions", () => {
    render(ui());
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getAllByText("Restore")).toHaveLength(2); // v2, v1
  });

  it("restoring a past version PUTs its body as the patch", () => {
    render(ui());
    const restoreButtons = screen.getAllByText("Restore");
    fireEvent.click(restoreButtons[1]!); // v1 (last row)
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      { id: "sk1", patch: { body: "# Rule\nOld text." } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("the oldest version (v1) has no Diff button — there's no earlier version to compare against", () => {
    render(ui());
    // Only v3 and v2 have a predecessor.
    expect(screen.getAllByText("Diff")).toHaveLength(2);
  });

  it("Diff compares a version against its PREVIOUS version, not the current body", () => {
    render(ui());
    const diffButtons = screen.getAllByText("Diff");
    fireEvent.click(diffButtons[1]!); // v2's Diff (v1 → v2)
    expect(screen.getByText("v1 → v2")).toBeInTheDocument();
    // v1 → v2 only adds "Extra line." — "Old text." is unchanged between v1 and v2.
    expect(screen.getByText(/\+ Extra line\./)).toBeInTheDocument();
    expect(screen.queryByText(/- Old text\./)).not.toBeInTheDocument();
  });

  it("v3's Diff compares against v2 (not v1), catching the actual last edit", () => {
    render(ui());
    const diffButtons = screen.getAllByText("Diff");
    fireEvent.click(diffButtons[0]!); // v3's Diff (v2 → v3)
    expect(screen.getByText("v2 → v3")).toBeInTheDocument();
    expect(screen.getByText(/- Old text\./)).toBeInTheDocument();
    expect(screen.getByText(/\+ New text\./)).toBeInTheDocument();
  });

  it("toggling Diff again hides the panel", () => {
    render(ui());
    const diffButtons = screen.getAllByText("Diff");
    fireEvent.click(diffButtons[1]!);
    expect(screen.getByText("v1 → v2")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Hide diff"));
    expect(screen.queryByText("v1 → v2")).not.toBeInTheDocument();
  });
});
