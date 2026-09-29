import type { CSSProperties } from "react";

/** Co-located styles for CreateConventionsSkillModal. */
export const s = {
  body: { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  banner: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "10px 12px",
    borderRadius: 7,
    fontSize: 13,
    lineHeight: 1.45,
    color: "var(--text-secondary)",
    background: "var(--accent-bg)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  notice: {
    padding: "8px 12px",
    borderRadius: 7,
    fontSize: 13,
    color: "var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,
  error: {
    padding: "8px 12px",
    borderRadius: 7,
    fontSize: 13,
    color: "var(--crit)",
    background: "var(--crit-bg)",
  } satisfies CSSProperties,
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } satisfies CSSProperties,
  enabledRow: { display: "flex", alignItems: "center", gap: 10, minHeight: 34 } satisfies CSSProperties,
  agentList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  agentModel: { fontSize: 12, color: "var(--text-muted)", marginLeft: 6 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10, width: "100%" } satisfies CSSProperties,
  footerNote: { flex: 1, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  loading: { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
