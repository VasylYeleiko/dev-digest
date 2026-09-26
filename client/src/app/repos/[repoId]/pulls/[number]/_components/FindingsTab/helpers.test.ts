import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { groupFindingsByRun } from "./helpers";

const finding = (id: string) => ({ id }) as FindingRecord;
const review = (run_id: string | null, ids: string[]) =>
  ({ run_id, findings: ids.map(finding) }) as unknown as ReviewRecord;

describe("groupFindingsByRun", () => {
  it("merges several reviews of one run and skips reviews with no run", () => {
    const map = groupFindingsByRun([review("r1", ["a"]), review("r1", ["b"]), review(null, ["c"]), review("r2", [])]);
    expect(map.r1!.map((f) => f.id)).toEqual(["a", "b"]);
    expect(map.r2).toEqual([]);
    expect(Object.keys(map)).toEqual(["r1", "r2"]);
  });
});
