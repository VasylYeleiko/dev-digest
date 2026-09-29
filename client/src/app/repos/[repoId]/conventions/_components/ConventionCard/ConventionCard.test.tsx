import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Convention } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CONVENTION: Convention = {
  id: "c1",
  repo_id: "r1",
  category: "async",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts",
  evidence_line_start: 23,
  evidence_line_end: 24,
  evidence_snippet: "const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId: id });",
  confidence: 0.914,
  status: "pending",
  created_at: "2026-09-26T10:00:00.000Z",
  updated_at: "2026-09-26T10:00:00.000Z",
};

function renderCard(convention: Convention = CONVENTION) {
  const onStatus = vi.fn();
  const onSave = vi.fn(async () => {});
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard convention={convention} busy={false} onStatus={onStatus} onSave={onSave} />
    </NextIntlClientProvider>,
  );
  return { onStatus, onSave };
}

describe("ConventionCard", () => {
  it("shows the rule, its evidence and confidence, and triages via Accept / Reject", () => {
    const { onStatus } = renderCard();
    expect(screen.getByText(CONVENTION.rule)).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-24")).toBeInTheDocument();
    expect(screen.getByText(/const posts = await db\.posts\.findMany/)).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("async")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onStatus).toHaveBeenLastCalledWith("accepted");
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onStatus).toHaveBeenLastCalledWith("rejected");
  });

  it("an accepted card reads 'Accepted' and clicking it un-accepts back to pending", () => {
    const { onStatus } = renderCard({
      ...CONVENTION,
      rule: "Type-only imports must use `import type` in `server/src`.",
      status: "accepted",
    });
    // Backticked spans from the model render as inline code, not literal backticks.
    expect(screen.getByText("import type").tagName).toBe("CODE");
    expect(screen.queryByText(/`/)).toBeNull();
    const button = screen.getByRole("button", { name: "Accepted" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(onStatus).toHaveBeenCalledWith("pending");
  });

  it("edits the rule and category inline, on the same card", async () => {
    const { onSave, onStatus } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const editor = screen.getByDisplayValue(CONVENTION.rule);
    // Triage is locked while editing so a half-edited rule can't be accepted.
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    fireEvent.change(editor, { target: { value: "  Prefer async/await over .then() chains  " } });
    fireEvent.change(screen.getByDisplayValue("async"), { target: { value: "naming" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ rule: "Prefer async/await over .then() chains", category: "naming" }),
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());
    expect(onStatus).not.toHaveBeenCalled();
  });
});
