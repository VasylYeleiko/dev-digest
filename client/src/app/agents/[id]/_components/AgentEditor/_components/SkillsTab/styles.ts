import type { CSSProperties } from "react";

/** Co-located styles for SkillsTab. */
export const s = {
  wrap: { maxWidth: 640 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 12 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  searchBox: { marginBottom: 8 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 } satisfies CSSProperties,
  row: (dragOver: boolean, disabled: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid " + (dragOver ? "var(--accent)" : "var(--border)"),
    background: "var(--bg-elevated)",
    marginBottom: 6,
    opacity: disabled ? 0.55 : 1,
  }),
  handle: (draggable: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    color: "var(--text-muted)",
    cursor: draggable ? "grab" : "default",
    visibility: draggable ? "visible" : "hidden",
  }),
  checkboxAndName: { display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  disabledBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    background: "var(--bg-hover)",
    padding: "1px 7px",
    borderRadius: 4,
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;
