import type { CSSProperties } from "react";
import { DROPDOWN_WIDTH } from "./constants";

/** Co-located styles for RunReviewDropdown. The menu is a local reimplementation
   of `@devdigest/ui`'s `Dropdown` visual chrome (same tokens: border, radius,
   shadow, `ddpop` animation) — it can't reuse `Dropdown` itself because that
   primitive's `DropdownItem` closes the menu on every click, which is
   incompatible with a checkbox row that must stay open while the user
   multi-selects (see the component's file comment). */
export const s = {
  wrap: { position: "relative", display: "inline-block" } satisfies CSSProperties,
  panel: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    width: DROPDOWN_WIDTH,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    boxShadow: "var(--shadow-modal)",
    padding: 6,
    zIndex: 40,
    animation: "ddpop .12s ease",
  } satisfies CSSProperties,
  divider: {
    height: 1,
    background: "var(--border)",
    margin: "6px 0",
  } satisfies CSSProperties,
  actionRow: (hover: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: "none",
    background: hover ? "var(--bg-hover)" : "transparent",
    color: "var(--text-primary)",
    fontSize: 14,
    fontWeight: 500,
    textAlign: "left",
    cursor: "pointer",
  }),
  actionRowMuted: (hover: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: "none",
    background: hover ? "var(--bg-hover)" : "transparent",
    color: "var(--text-secondary)",
    fontSize: 14,
    fontWeight: 500,
    textAlign: "left",
    cursor: "pointer",
  }),
  warningRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    color: "var(--text-secondary)",
    fontSize: 13,
  } satisfies CSSProperties,
  agentList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    maxHeight: 240,
    overflowY: "auto",
  } satisfies CSSProperties,
  agentRow: {
    padding: "6px 10px",
    borderRadius: 6,
  } satisfies CSSProperties,
  agentLabel: { display: "flex", flexDirection: "column", gap: 1 } satisfies CSSProperties,
  agentName: { fontSize: 14, fontWeight: 500, color: "var(--text-primary)" } satisfies CSSProperties,
  agentHint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
