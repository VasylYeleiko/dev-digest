import type { CSSProperties } from "react";

/** Co-located styles for ConfirmDeleteModal. */
export const s = {
  body: { padding: "18px 24px", fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10, width: "100%" } satisfies CSSProperties,
} as const;
