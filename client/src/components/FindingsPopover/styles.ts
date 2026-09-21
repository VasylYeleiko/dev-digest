import type { CSSProperties } from "react";

/** Co-located styles for FindingsPopover. */
export const s = {
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  trigger: {
    position: "relative",
    display: "inline-flex",
  } satisfies CSSProperties,
  icons: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  // Portaled to document.body — position: fixed, top/left set inline per
  // instance from the trigger's getBoundingClientRect(). Width here MUST
  // match `constants.ts`'s PANEL_WIDTH (used to clamp `left`).
  panel: {
    position: "fixed",
    zIndex: 60,
    width: 360,
    maxHeight: 320,
    overflowY: "auto",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    boxShadow: "0 8px 24px rgba(0,0,0,.35)",
    padding: 12,
    cursor: "default",
  } satisfies CSSProperties,
  panelHeader: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  item: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 10px",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  itemHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  } satisfies CSSProperties,
  itemTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  itemMeta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  } satisfies CSSProperties,
  itemLocation: {
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  itemBody: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
} as const;
