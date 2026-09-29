import type { CSSProperties } from "react";

/** Co-located styles for SkillTypeChip. */
export const s = {
  chip: (color: string): CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    color,
    background: color + "1a",
    padding: "1px 8px",
    borderRadius: 4,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  }),
} as const;
