/* SkillPreviewPanel — side-panel preview opened by clicking a card on the
   Skills list: metadata, injection report, and the rendered body, with
   "Open editor" to go to /skills/:id for Config / Preview / Versions. */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeChip } from "../../../../components/SkillTypeChip";
import { InjectionAlert } from "../../../../components/InjectionAlert";
import { PANEL_WIDTH } from "./constants";
import { s } from "./styles";

export function SkillPreviewPanel({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  return (
    <Drawer
      width={PANEL_WIDTH}
      title={skill.name}
      subtitle={skill.description}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("previewPanel.close")}
          </Button>
          <Button kind="primary" icon="ArrowRight" onClick={() => router.push(`/skills/${skill.id}?tab=config`)}>
            {t("previewPanel.openEditor")}
          </Button>
        </div>
      }
    >
      <div style={s.meta}>
        <SkillTypeChip type={skill.type} />
        <Badge color="var(--text-secondary)">{t(`listItem.source.${skill.source}`)}</Badge>
        <Badge color="var(--text-secondary)" mono>
          {t("listItem.version", { version: skill.version })}
        </Badge>
        <Badge color="var(--text-secondary)" icon="Cpu">
          {t("listItem.agentCount", { count: skill.agent_count ?? 0 })}
        </Badge>
        {!skill.enabled && <Badge color="var(--text-muted)">{t("preview.disabled")}</Badge>}
      </div>
      {skill.injection && <InjectionAlert report={skill.injection} variant="blocked" />}
      {skill.body.trim() ? (
        <div style={s.body}>
          <Markdown>{skill.body}</Markdown>
        </div>
      ) : (
        <p style={s.empty}>{t("previewPanel.empty")}</p>
      )}
    </Drawer>
  );
}
