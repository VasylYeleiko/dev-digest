import type { Convention } from "@devdigest/shared";
import { CONFIDENCE_OK, CONFIDENCE_WARN } from "./constants";

/** 0.914 → 91; null when the model gave no usable score. */
export function confidencePercent(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100);
}

/** Bar colour by support: strong → ok, mixed → warn, weak → crit. */
export function confidenceColor(percent: number): string {
  if (percent >= CONFIDENCE_OK) return "var(--ok)";
  if (percent >= CONFIDENCE_WARN) return "var(--warn)";
  return "var(--crit)";
}

export interface RuleSegment {
  text: string;
  code: boolean;
}

/**
 * Split a rule on single-backtick spans ("Use `import type` in …") so the
 * card can render them as inline code. An unmatched backtick stays literal.
 */
export function splitInlineCode(rule: string): RuleSegment[] {
  const parts = rule.split("`");
  if (parts.length % 2 === 0) return [{ text: rule, code: false }];
  return parts
    .map((text, i) => ({ text, code: i % 2 === 1 }))
    .filter((seg) => seg.text.length > 0);
}

/** `src/api/users.ts:23-31` (or `:23` for one line); null without evidence. */
export function evidenceRef(
  c: Pick<Convention, "evidence_path" | "evidence_line_start" | "evidence_line_end">,
): string | null {
  if (!c.evidence_path) return null;
  if (c.evidence_line_start === null) return c.evidence_path;
  const end = c.evidence_line_end ?? c.evidence_line_start;
  return end > c.evidence_line_start
    ? `${c.evidence_path}:${c.evidence_line_start}-${end}`
    : `${c.evidence_path}:${c.evidence_line_start}`;
}
