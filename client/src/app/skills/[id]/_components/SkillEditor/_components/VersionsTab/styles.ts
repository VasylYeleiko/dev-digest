import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab (incl. its inline diff block). */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 } satisfies CSSProperties,
  card: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 8,
    overflow: "hidden",
  } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
  } satisfies CSSProperties,
  rowLabel: { fontSize: 14, fontWeight: 600, flex: 1 } satisfies CSSProperties,
  rowActions: { display: "flex", gap: 8 } satisfies CSSProperties,
  diffPanel: {
    borderTop: "1px solid var(--border)",
    padding: "12px 14px",
  } satisfies CSSProperties,
  diffRange: { fontSize: 12, color: "var(--text-muted)", marginBottom: 8 } satisfies CSSProperties,
  diffBody: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12.5,
    lineHeight: 1.6,
    background: "var(--bg-primary)",
    borderRadius: 8,
    padding: 12,
    maxHeight: 420,
    overflow: "auto",
  } satisfies CSSProperties,
  diffLine: (type: "same" | "add" | "remove"): CSSProperties => ({
    padding: "0 6px",
    whiteSpace: "pre-wrap",
    background: type === "add" ? "rgba(16,185,129,0.15)" : type === "remove" ? "rgba(239,68,68,0.15)" : "transparent",
    color: type === "add" ? "var(--ok)" : type === "remove" ? "var(--crit)" : "var(--text-secondary)",
  }),
} as const;
