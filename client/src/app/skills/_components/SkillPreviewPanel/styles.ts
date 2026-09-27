import type { CSSProperties } from "react";

/** Co-located styles for SkillPreviewPanel. */
export const s = {
  meta: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 } satisfies CSSProperties,
  body: { fontSize: 14, lineHeight: 1.6 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
