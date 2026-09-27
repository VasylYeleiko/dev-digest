import { INJECTION_NAME_LINE, type InjectionFinding } from "@devdigest/shared";

export interface FindingsOnLine {
  line: number;
  rules: string[];
  excerpt: string;
}

/** One row per offending line: a line that trips three rules is shown once. */
export function groupByLine(findings: readonly InjectionFinding[]): FindingsOnLine[] {
  const rows: FindingsOnLine[] = [];
  for (const f of findings) {
    const row = rows.find((r) => r.line === f.line);
    if (!row) rows.push({ line: f.line, rules: [f.rule], excerpt: f.excerpt });
    else if (!row.rules.includes(f.rule)) row.rules.push(f.rule);
  }
  return rows.sort((a, b) => a.line - b.line);
}

/** The finding is in the skill's name, not a body line (sorts first, line 0). */
export function isNameRow(row: FindingsOnLine): boolean {
  return row.line === INJECTION_NAME_LINE;
}
