import type { CSSProperties } from "react";

/** Co-located styles for InjectionAlert. */
export const s = {
  box: {
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--text-primary)",
    marginBottom: 16,
  } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 8, color: "var(--crit)" } satisfies CSSProperties,
  title: { fontSize: 13, letterSpacing: "0.02em" } satisfies CSSProperties,
  body: { fontSize: 13, color: "var(--text-secondary)", margin: "6px 0 10px", lineHeight: 1.45 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  item: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 } satisfies CSSProperties,
  itemHead: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  line: { color: "var(--crit)", flexShrink: 0 } satisfies CSSProperties,
  excerpt: {
    display: "block",
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 4,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
} as const;
