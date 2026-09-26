export interface DiffLine {
  type: "same" | "add" | "remove";
  text: string;
}

/** Small hand-rolled line-level diff (LCS-based) — no diff library dependency.
 *  Bodies are markdown text blocks, small enough for an O(n*m) table. */
export function diffLines(from: string, to: string): DiffLine[] {
  const a = from.split("\n");
  const b = to.split("\n");
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: "same", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      result.push({ type: "remove", text: a[i]! });
      i++;
    } else {
      result.push({ type: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: "remove", text: a[i]! });
    i++;
  }
  while (j < m) {
    result.push({ type: "add", text: b[j]! });
    j++;
  }
  return result;
}

/** "Sep 24, 2026" — falls back to the raw string if it doesn't parse. */
export function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
