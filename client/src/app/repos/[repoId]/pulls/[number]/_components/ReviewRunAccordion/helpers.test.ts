import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { openBlockers } from "./helpers";

const f = (severity: string, dismissed_at: string | null = null) =>
  ({ severity, dismissed_at }) as FindingRecord;

describe("openBlockers", () => {
  it("counts undismissed CRITICAL findings only", () => {
    expect(openBlockers([f("CRITICAL"), f("CRITICAL", "2026-01-01"), f("WARNING")])).toBe(1);
    expect(openBlockers([])).toBe(0);
  });
});
