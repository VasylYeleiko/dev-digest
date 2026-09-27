/* /skills — Skills list. SkillCards, an Add-Skill menu (create from scratch in
   a modal, or import via the drawer), and a side-panel preview: clicking a card
   opens it; the panel's "Open editor" goes to the tabbed Skill Editor at
   /skills/:id. Mirrors AgentsListView. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { AddSkillDrawer, type AddSkillDrawerTab } from "../AddSkillDrawer";
import { CreateSkillModal } from "../CreateSkillModal";
import { SkillPreviewPanel } from "../SkillPreviewPanel";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [drawerTab, setDrawerTab] = React.useState<AddSkillDrawerTab | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  // Looked up from the live list so the panel reflects toggles/edits.
  const previewed = previewId ? (skills ?? []).find((sk) => sk.id === previewId) : undefined;

  const list = filterSkills(skills ?? [], search);
  const openDrawer = (tab: AddSkillDrawerTab) => setDrawerTab(tab);

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {drawerTab && <AddSkillDrawer initialTab={drawerTab} onClose={() => setDrawerTab(null)} />}
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      {previewed && <SkillPreviewPanel skill={previewed} onClose={() => setPreviewId(null)} />}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("page.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <Dropdown
            width={220}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.create"), icon: "Plus", onClick: () => setCreating(true) },
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => openDrawer("file") },
              { label: t("page.menu.fromUrl"), icon: "Link", onClick: () => openDrawer("url") },
              { label: t("page.menu.community"), icon: "Globe", onClick: () => openDrawer("community") },
            ]}
          />
        </div>

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => openDrawer("file")}
          />
        )}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                sk={sk}
                active={sk.id === previewId}
                onClick={() => setPreviewId(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
