import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Convention, ConventionsResponse } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";

const extractMutate = vi.hoisted(() => vi.fn());
const updateMutate = vi.hoisted(() => vi.fn());
const listState = vi.hoisted(() => ({ current: {} as { data?: ConventionsResponse } }));

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("../../../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../../../../components/repo-not-found", () => ({ RepoNotFound: () => <div>no repo</div> }));
vi.mock("../../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/payments-api" } }),
  useRepoNotFound: () => false,
}));
vi.mock("../../../../../../lib/hooks/conventions", () => ({
  useConventions: () => ({ isLoading: false, isError: false, refetch: vi.fn(), ...listState.current }),
  useExtractConventions: () => ({ mutate: extractMutate, isPending: false, isError: false }),
  useUpdateConvention: () => ({ mutate: updateMutate, mutateAsync: vi.fn(), isPending: false }),
  // The Create-skill modal's draft query — left loading; the modal has its own tests.
  useConventionSkillDraft: () => ({}),
  useCreateConventionsSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../../../../../lib/hooks/agents", () => ({ useAgents: () => ({}) }));

import { ConventionsView } from "./ConventionsView";

const convention = (id: string, rule: string, status: Convention["status"]): Convention => ({
  id,
  repo_id: "r1",
  category: "async",
  rule,
  evidence_path: "src/a.ts",
  evidence_line_start: 1,
  evidence_line_end: 1,
  evidence_snippet: "await x();",
  confidence: 0.8,
  status,
  created_at: "2026-09-26T10:00:00.000Z",
  updated_at: "2026-09-26T10:00:00.000Z",
});

const SCAN: ConventionsResponse["scan"] = {
  id: "scan1",
  repo_id: "r1",
  provider: "openai",
  model: "gpt-5.4",
  sample_files: Array.from({ length: 17 }, (_, i) => `f${i}.ts`),
  proposed: 13,
  dropped: 2,
  skipped: 1,
  cost_usd: 0.001,
  created_at: new Date().toISOString(),
};

afterEach(() => {
  cleanup();
  extractMutate.mockReset();
  updateMutate.mockReset();
});

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsView />
    </NextIntlClientProvider>,
  );
}

describe("ConventionsView", () => {
  it("before the first scan offers Run Scan and starts the extraction", () => {
    listState.current = { data: { scan: null, items: [] } };
    renderView();
    expect(screen.getByText(/Conventions in/)).toHaveTextContent("Conventions in acme/payments-api");
    expect(screen.queryByRole("button", { name: "Re-scan" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Run Scan" }));
    expect(extractMutate).toHaveBeenCalledTimes(1);
  });

  it("after a scan lists candidates with scan stats, Re-scan, and triage wired to the API", () => {
    listState.current = {
      data: { scan: SCAN, items: [convention("c1", "Use async/await.", "pending"), convention("c2", "Name routes.", "pending")] },
    };
    renderView();
    expect(screen.getByText(/Detected from 17 sample files · last scan/)).toBeInTheDocument();
    expect(screen.getByText("13 proposed · 2 dropped by the evidence check · 1 already triaged")).toBeInTheDocument();
    expect(screen.getByText("0 of 2 accepted")).toBeInTheDocument();
    // Nothing accepted yet → no Create skill.
    expect(screen.queryByRole("button", { name: "Create skill" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Re-scan" }));
    expect(extractMutate).toHaveBeenCalledTimes(1);

    const card = screen.getByRole("article", { name: "Name routes." });
    fireEvent.click(within(card).getByRole("button", { name: "Reject" }));
    expect(updateMutate).toHaveBeenCalledWith({ id: "c2", patch: { status: "rejected" } });
  });

  it("shows Create skill once a candidate is accepted and opens the modal", () => {
    listState.current = {
      data: { scan: SCAN, items: [convention("c1", "Use async/await.", "accepted"), convention("c2", "Name routes.", "pending")] },
    };
    renderView();
    expect(screen.getByText("1 of 2 accepted")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Create skill from conventions");
  });
});
