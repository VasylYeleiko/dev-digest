import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillModal. */
export const s = {
  body: { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } satisfies CSSProperties,
  toggleRow: { display: "flex", alignItems: "center", minHeight: 34 } satisfies CSSProperties,
  error: {
    padding: "8px 12px",
    borderRadius: 7,
    fontSize: 13,
    color: "var(--crit)",
    background: "var(--crit-bg)",
  } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10, width: "100%" } satisfies CSSProperties,
} as const;
