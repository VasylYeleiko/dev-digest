/* SeverityBar — ONE row of interactive severity pills for FindingsPanel: a
   pill renders only for a severity that actually has findings in this run
   (icon → label → count, same content order as the read-only SeverityBadge),
   and the pill itself is the filter control — click to narrow the card list
   below to that severity, click the active one again to clear. Purely
   presentational — all state (which severity is active) lives in the parent. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import { SEVERITIES, type FindingSeverity } from "../../severity";
import { s } from "./styles";

export function SeverityBar({
  counts,
  active,
  onToggle,
}: {
  counts: Record<FindingSeverity, number>;
  active: FindingSeverity | null;
  onToggle: (severity: FindingSeverity) => void;
}) {
  const t = useTranslations("prReview");
  const present = SEVERITIES.filter((sev) => counts[sev] > 0);
  if (present.length === 0) return null;

  return (
    <div role="group" aria-label={t("panel.filterBySeverity")} style={s.severityRow}>
      {present.map((sev) => {
        const tok = SEV[sev];
        const I = Icon[tok.icon];
        const isActive = active === sev;
        return (
          <button
            key={sev}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(sev)}
            style={s.severityPill(tok.c, tok.bg, isActive)}
          >
            <I size={13} />
            {t(`panel.severity.${sev}`)}
            <span className="tnum" style={s.severityPillCount}>
              {counts[sev]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
