/* StatsTab — used-by + agents-using are real; accept-rate/findings(30d) are
   aggregated across the agents using this skill (approximation, labeled as
   such); pull frequency has no data source yet ("coming soon"). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MetricCard, BarRow } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "../../../../../../../lib/hooks/skills";
import { s } from "./styles";

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading } = useSkillStats(skill.id);

  if (isLoading || !stats) {
    return <div style={s.wrap}>{t("stats.comingSoon")}</div>;
  }

  const maxCount = Math.max(1, ...stats.findings_by_category.map((c) => c.count));

  return (
    <div style={s.wrap}>
      <div style={s.metrics}>
        <MetricCard label={t("stats.usedBy")} value={stats.used_by} />
        <MetricCard
          label={t("stats.acceptRate")}
          value={stats.accept_rate != null ? `${Math.round(stats.accept_rate * 100)}%` : "—"}
        />
        <MetricCard label={t("stats.findings30d")} value={stats.findings_30d ?? "—"} />
        <MetricCard label={t("stats.pullFrequency")} value={t("stats.comingSoon")} />
      </div>
      <div style={s.approxNote}>{t("stats.acrossAgents")}</div>

      <div style={s.section}>
        <div style={s.sectionTitle}>{t("stats.agentsUsing")}</div>
        {stats.agents.length === 0 && <div style={s.muted}>{t("stats.noAgents")}</div>}
        {stats.agents.map((a) => (
          <div key={a.id} style={s.agentRow}>
            <Link href={`/agents/${a.id}`} style={s.agentLink}>
              {a.name}
            </Link>
          </div>
        ))}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>{t("stats.findingsByCategory")}</div>
        {stats.findings_by_category.length === 0 && <div style={s.muted}>{t("stats.noFindings")}</div>}
        {stats.findings_by_category.map((c) => (
          <BarRow key={c.category} label={c.category} value={c.count} max={maxCount} suffix={String(c.count)} />
        ))}
      </div>
    </div>
  );
}
