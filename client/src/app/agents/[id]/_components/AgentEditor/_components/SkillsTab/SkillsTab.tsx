/* SkillsTab — attach/reorder skills linked to this agent. Renders a plain
   checkbox list (NOT the shared Dropdown — it has no slot for a persistent
   multi-select row, see client/INSIGHTS.md 2026-09-20) ordered linked-first
   by prompt order (disabled-but-linked skills stay visible so they can be
   detached/reordered), then unlinked-enabled, then unlinked-disabled.
   Reordering uses native HTML5 drag & drop on the linked rows' handle —
   dropping recomputes the full ordered id list and replaces the whole set
   via useSetAgentSkills (which applies the reorder optimistically so the
   row doesn't snap back while the mutation is in flight). A disabled skill
   (toggled off on the Skills page) can't be freshly attached — its checkbox
   gets no onChange, so a click no-ops — but stays attachable-to-detach if
   it was already linked. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, TextInput, Icon, Skeleton, EmptyState } from "@devdigest/ui";
import type { Agent, Skill } from "@devdigest/shared";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { SkillTypeChip } from "../../../../../../../components/SkillTypeChip";
import { canAttach, filterSkillsByName, orderedLinkedIds, reorderIds } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: allSkills, isLoading: skillsLoading } = useSkills();
  const { data: links, isLoading: linksLoading } = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();
  const [search, setSearch] = React.useState("");
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  if (skillsLoading || linksLoading || !allSkills || !links) {
    return <Skeleton height={160} />;
  }

  const linkedIds = orderedLinkedIds(links);
  const linkedSet = new Set(linkedIds);
  const linkedSkills = linkedIds
    .map((id) => allSkills.find((sk) => sk.id === id))
    .filter((sk): sk is Skill => !!sk);
  const unlinkedSkills = allSkills.filter((sk) => !linkedSet.has(sk.id));
  const unlinkedEnabled = unlinkedSkills.filter((sk) => sk.enabled);
  const unlinkedDisabled = unlinkedSkills.filter((sk) => !sk.enabled);
  const visible = filterSkillsByName([...linkedSkills, ...unlinkedEnabled, ...unlinkedDisabled], search);
  const enabledLinkedCount = linkedSkills.filter((sk) => sk.enabled).length;

  const toggle = (skillId: string, on: boolean) => {
    const next = on ? [...linkedIds, skillId] : linkedIds.filter((id) => id !== skillId);
    setSkills.mutate({ agentId: agent.id, skillIds: next });
  };

  const resetDrag = () => {
    setDraggingId(null);
    setOverId(null);
  };

  const handleDrop = (targetId: string) => {
    if (draggingId) {
      const next = reorderIds(linkedIds, draggingId, targetId);
      if (next !== linkedIds) setSkills.mutate({ agentId: agent.id, skillIds: next });
    }
    resetDrag();
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.enabledCount", { linked: enabledLinkedCount, total: allSkills.length })}</h2>
      </div>
      <div style={s.searchBox}>
        <TextInput value={search} onChange={setSearch} placeholder={t("skills.filterPlaceholder")} />
      </div>
      <div style={s.hint}>{t("skills.orderHint")}</div>
      {visible.length === 0 && <EmptyState icon="Sparkles" title={t("skills.filterPlaceholder")} />}
      {visible.map((sk) => {
        const isLinked = linkedSet.has(sk.id);
        const attachable = canAttach(sk);
        const draggable = isLinked;
        return (
          <div
            key={sk.id}
            style={s.row(overId === sk.id && draggingId !== null && draggingId !== sk.id, !sk.enabled)}
            draggable={draggable}
            onDragStart={draggable ? () => setDraggingId(sk.id) : undefined}
            onDragOver={
              draggable
                ? (e) => {
                    e.preventDefault();
                    if (draggingId && draggingId !== sk.id) setOverId(sk.id);
                  }
                : undefined
            }
            onDrop={
              draggable
                ? (e) => {
                    e.preventDefault();
                    handleDrop(sk.id);
                  }
                : undefined
            }
            onDragEnd={draggable ? resetDrag : undefined}
          >
            <div style={s.handle(draggable)} aria-label={draggable ? t("skills.dragHandle") : undefined}>
              <Icon.Menu size={14} />
            </div>
            <div style={s.checkboxAndName}>
              <Checkbox
                checked={isLinked}
                onChange={isLinked ? (on) => !on && toggle(sk.id, false) : attachable ? (on) => toggle(sk.id, on) : undefined}
                label={sk.name}
              />
            </div>
            <div style={s.meta} title={!attachable && !isLinked ? t("skills.disabledHint") : undefined}>
              <SkillTypeChip type={sk.type} />
              {!sk.enabled && <span style={s.disabledBadge}>{t("skills.disabledBadge")}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
