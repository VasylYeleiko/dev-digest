import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView (mirrors SkillsListView). */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1000, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repoName: { color: "var(--accent)" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  stats: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  scanHint: { fontSize: 12, color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
  scanError: {
    padding: "10px 12px",
    borderRadius: 7,
    fontSize: 13,
    marginBottom: 14,
    color: "var(--crit)",
    background: "var(--crit-bg)",
  } satisfies CSSProperties,
  loadingStack: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
