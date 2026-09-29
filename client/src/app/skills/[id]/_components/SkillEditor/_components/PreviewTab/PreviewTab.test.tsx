import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { PreviewTab } from "./PreviewTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "Branch Coverage Rubric",
  description: "Flags uncovered branches",
  type: "rubric",
  source: "manual",
  body: "# Cover Every Branch\nCheck for **uncovered** branches.",
  enabled: true,
  version: 1,
};

describe("PreviewTab", () => {
  it("renders the body as markdown with the receiving-agent caption", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <PreviewTab skill={SKILL} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Rendered as the reviewing agent receives it.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cover Every Branch" })).toBeInTheDocument();
    expect(screen.getByText("uncovered")).toBeInTheDocument();
  });
});
