/* SkillCard — name, type + source badges, version, how many agents use it,
   description, enabled toggle and Delete (with a confirmation modal). Shared
   between the Skills list grid and the Skill Editor's left sidebar list
   (mirrors AgentCard's dual use in AgentsListView / AgentEditorPage). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "../../../../lib/hooks/skills";
import { SkillTypeChip } from "../../../../components/SkillTypeChip";
import { InjectionBadge } from "../../../../components/InjectionBadge";
import { ConfirmDeleteModal } from "../../../../components/ConfirmDeleteModal";
import { sourceIcon } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  sk,
  active,
  onClick,
  onToggle,
}: {
  sk: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const [confirming, setConfirming] = React.useState(false);
  const blocked = sk.injection?.detected ?? false;
  const agentCount = sk.agent_count ?? 0;

  return (
    <div onClick={onClick} style={s.card(!!active, sk.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span style={s.name}>{sk.name}</span>
        {onToggle && (
          <div
            onClick={(e) => e.stopPropagation()}
            title={blocked ? t("injection.toggleBlocked") : undefined}
            style={blocked ? s.blockedToggle : undefined}
          >
            {/* Enabling a flagged skill is refused server-side — make the switch inert. */}
            <Toggle on={sk.enabled} onChange={blocked ? () => {} : onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          disabled={del.isPending}
          title="Delete skill"
          aria-label="Delete skill"
          style={s.deleteButton(del.isPending)}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{sk.description}</div>
      <div style={s.metaRow}>
        <SkillTypeChip type={sk.type} />
        {blocked && <InjectionBadge />}
        <Badge color="var(--text-secondary)" icon={sourceIcon(sk.source)}>
          {t(`listItem.source.${sk.source}`)}
        </Badge>
        <Badge color="var(--text-secondary)" mono>
          {t("listItem.version", { version: sk.version })}
        </Badge>
        <Badge color="var(--text-secondary)" icon="Cpu">
          {t("listItem.agentCount", { count: agentCount })}
        </Badge>
      </div>
      {confirming && (
        // The modal renders inside the card: keep its clicks from opening the card.
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDeleteModal
            title={t("deleteModal.title")}
            body={t("deleteModal.body", { name: sk.name, count: agentCount })}
            pending={del.isPending}
            onClose={() => setConfirming(false)}
            onConfirm={() => del.mutate(sk.id, { onSuccess: () => setConfirming(false) })}
          />
        </div>
      )}
    </div>
  );
}
