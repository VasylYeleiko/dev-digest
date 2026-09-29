import type { Convention } from "@devdigest/shared";

export function acceptedIds(items: readonly Convention[]): string[] {
  return items.filter((c) => c.status === "accepted").map((c) => c.id);
}

export function pendingIds(items: readonly Convention[]): string[] {
  return items.filter((c) => c.status === "pending").map((c) => c.id);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "3 minutes ago" / "yesterday" for the scan header; "just now" under a minute. */
export function formatAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (Number.isNaN(seconds)) return iso;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "second");
}
