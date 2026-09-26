/* SkillEditor — Config · Preview · Versions · Stats · Evals tabs. Mirrors
   AgentEditor's shell + tab-routing shape. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersionsTab } from "./_components/VersionsTab";
import { StatsTab } from "./_components/StatsTab";
import { EvalsTab } from "./_components/EvalsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "config" && <ConfigTab key={skill.id} skill={skill} />}
        {tab === "preview" && <PreviewTab key={skill.id} skill={skill} />}
        {tab === "versions" && <VersionsTab key={skill.id} skill={skill} />}
        {tab === "stats" && <StatsTab key={skill.id} skill={skill} />}
        {tab === "evals" && <EvalsTab />}
      </div>
    </div>
  );
}
