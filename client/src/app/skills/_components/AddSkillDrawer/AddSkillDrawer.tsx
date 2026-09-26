/* AddSkillDrawer — File / URL / Community tabs. Only File is interactive
   (decision #1 in the Skills plan): import = file/archive only, preview then
   confirm; URL and Community render disabled "coming soon" content. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, Tabs } from "@devdigest/ui";
import { DRAWER_WIDTH } from "./constants";
import { FileTab } from "./FileTab";
import { UrlTab } from "./UrlTab";
import { CommunityTab } from "./CommunityTab";
import { s } from "./styles";

export type AddSkillDrawerTab = "file" | "url" | "community";

export function AddSkillDrawer({
  onClose,
  initialTab = "file",
}: {
  onClose: () => void;
  initialTab?: AddSkillDrawerTab;
}) {
  const t = useTranslations("skills");
  const [tab, setTab] = React.useState<AddSkillDrawerTab>(initialTab);
  const tabs = [
    { key: "file", label: t("drawer.tabs.file") },
    { key: "url", label: t("drawer.tabs.url") },
    { key: "community", label: t("drawer.tabs.community") },
  ];

  return (
    <Drawer width={DRAWER_WIDTH} title={t("drawer.title")} subtitle={t("drawer.subtitle")} onClose={onClose}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k as AddSkillDrawerTab)} pad="0" />
      </div>
      {tab === "file" && <FileTab onClose={onClose} />}
      {tab === "url" && <UrlTab />}
      {tab === "community" && <CommunityTab />}
    </Drawer>
  );
}
