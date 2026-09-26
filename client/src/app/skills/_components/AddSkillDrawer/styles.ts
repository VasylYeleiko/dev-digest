import type { CSSProperties } from "react";

/** Co-located styles for AddSkillDrawer + its tab bodies. */
export const s = {
  tabsBar: { marginBottom: 20 } satisfies CSSProperties,
  picker: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px dashed var(--border-strong)",
    background: "var(--bg-elevated)",
    marginBottom: 16,
  } satisfies CSSProperties,
  pickerLabel: { fontSize: 13, color: "var(--text-secondary)", flex: 1 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginBottom: 12 } satisfies CSSProperties,
  notice: {
    display: "flex",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--warn, #b45309)",
    background: "var(--warn-bg, rgba(180,83,9,0.1))",
    color: "var(--text-secondary)",
    fontSize: 12.5,
    lineHeight: 1.5,
    marginBottom: 16,
  } satisfies CSSProperties,
  actions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 } satisfies CSSProperties,
  disabledBody: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    opacity: 0.75,
  } satisfies CSSProperties,
  disabledHint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
