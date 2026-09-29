/* InjectionAlert — the prompt-injection report for a skill body: a banner plus
   one row per finding (line + what it tries to do + the offending text), so the
   author can find and fix it. `blocked` = a saved skill (Skill editor);
   `import` = a not-yet-saved preview (Add-Skill drawer). */
"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { InjectionReport } from "@devdigest/shared";
import { KNOWN_RULES } from "./constants";
import { groupByLine, isNameRow } from "./helpers";
import { s } from "./styles";

export function InjectionAlert({ report, variant }: { report: InjectionReport; variant: "blocked" | "import" }) {
  const t = useTranslations("skills");
  if (!report.detected) return null;
  return (
    <div role="alert" style={s.box}>
      <div style={s.titleRow}>
        <Icon.AlertOctagon size={16} />
        <strong style={s.title}>{variant === "blocked" ? t("injection.blockedTitle") : t("injection.importTitle")}</strong>
      </div>
      <p style={s.body}>{variant === "blocked" ? t("injection.blockedBody") : t("injection.importBody")}</p>
      <ul style={s.list}>
        {groupByLine(report.findings).map((row) => (
          <li key={row.line} style={s.item}>
            <div style={s.itemHead}>
              <span className="mono" style={s.line}>
                {isNameRow(row) ? t("injection.nameLine") : t("injection.line", { line: row.line })}
              </span>
              <span>
                {row.rules.map((r) => t(`injection.rule.${KNOWN_RULES.has(r) ? r : "unknown"}`)).join(" · ")}
              </span>
            </div>
            <code className="mono" style={s.excerpt}>
              {row.excerpt}
            </code>
          </li>
        ))}
      </ul>
    </div>
  );
}
