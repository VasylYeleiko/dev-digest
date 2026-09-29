import { describe, it, expect } from "vitest";
import { modelLabel, toModelOptions, withCurrentOption } from "./model-label";

describe("model picker options", () => {
  it("labels priced models with price and context window", () => {
    expect(
      modelLabel({ id: "m", pricing: { promptPerM: 0.14, completionPerM: 0.28 }, contextLength: 1_048_576 }),
    ).toBe("m — $0.140/$0.280 per 1M · 1M ctx");
    expect(toModelOptions([{ id: "plain" }])).toEqual(["plain"]);
  });

  it("withCurrentOption prepends a missing current model without mutating the input", () => {
    const options = ["a", { value: "b", label: "B" }];
    const out = withCurrentOption(options, "legacy");
    expect(out).toEqual(["legacy", "a", { value: "b", label: "B" }]);
    expect(options).toHaveLength(2);
  });

  it("withCurrentOption leaves the list alone when the model is already there", () => {
    const options = ["a", { value: "b", label: "B" }];
    expect(withCurrentOption(options, "b")).toBe(options);
  });
});
