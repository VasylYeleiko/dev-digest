import { describe, it, expect } from "vitest";
import { formatWhen } from "./dates";

describe("formatWhen", () => {
  it("formats a valid ISO timestamp in the local locale", () => {
    const iso = "2026-01-02T03:04:05Z";
    expect(formatWhen(iso)).toBe(new Date(iso).toLocaleString());
  });

  it("passes an unparseable value through unchanged", () => {
    expect(formatWhen("yesterday")).toBe("yesterday");
  });
});
