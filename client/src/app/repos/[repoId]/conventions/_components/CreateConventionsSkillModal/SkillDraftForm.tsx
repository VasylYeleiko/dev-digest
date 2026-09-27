"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, Modal, SelectInput, Textarea, TextInput, Toggle } from "@devdigest/ui";
import type { Agent, ConventionSkillDraft, SkillType } from "@devdigest/shared";
import { useCreateConventionsSkill } from "../../../../../../lib/hooks/conventions";
import { useToast } from "../../../../../../lib/toast";
import { approxTokens } from "../../../../../../lib/tokens";
import { slugFilename } from "../../../../../../lib/skill-filename";
import { AgentPicker } from "./AgentPicker";
import { BODY_ROWS, MODAL_WIDTH, SKILL_TYPE_VALUES } from "./constants";
import { canCreate, defaultAgentIds, toggleId } from "./helpers";
import { s } from "./styles";

/**
 * The editable form, mounted once the draft and the agent list are loaded so
 * its state initializes straight from them (no effect syncing props → state).
 */
export function SkillDraftForm({
  repoId,
  repoName,
  draft,
  agents,
  onClose,
}: {
  repoId: string;
  repoName: string;
  draft: ConventionSkillDraft;
  agents: readonly Agent[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const create = useCreateConventionsSkill(repoId);
  const [name, setName] = React.useState(draft.name);
  const [description, setDescription] = React.useState(draft.description);
  const [type, setType] = React.useState<SkillType>(draft.type);
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(draft.body);
  const [agentIds, setAgentIds] = React.useState(() => defaultAgentIds(agents));

  const existing = draft.existing_skill_id !== null && name.trim() === draft.name;
  const submittable = canCreate({ name, body, enabled, agentIds }) && !create.isPending;

  const submit = async () => {
    const res = await create.mutateAsync({
      name: name.trim(),
      description: description.trim() || draft.description,
      type,
      body,
      enabled,
      convention_ids: draft.convention_ids,
      agent_ids: agentIds,
    });
    const count = res.linked_agent_ids.length;
    toast.success(
      res.created
        ? t("modal.created", { name: res.skill.name, count })
        : t("modal.updated", { name: res.skill.name, version: res.skill.version, count }),
    );
    onClose();
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("modal.title")}
      subtitle={<span className="mono">{name || draft.name}</span>}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>{existing ? t("modal.footerExisting") : t("modal.footerNew")}</span>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={() => void submit().catch(() => {})} disabled={!submittable}>
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          <Icon.Info size={14} />
          <span>{t("modal.banner", { count: draft.convention_ids.length, repo: repoName })}</span>
        </div>
        {existing && <div style={s.notice}>{t("modal.existing", { name: draft.name })}</div>}
        {create.isError && (
          <div role="alert" style={s.error}>
            {create.error.message}
          </div>
        )}

        <FormField label={t("modal.fields.name")} required>
          <TextInput value={name} onChange={setName} mono />
        </FormField>
        <FormField label={t("modal.fields.description")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <div style={s.row}>
          <FormField label={t("modal.fields.type")}>
            <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={[...SKILL_TYPE_VALUES]} />
          </FormField>
          <FormField label={t("modal.fields.enabled")} hint={t("modal.fields.enabledHint")}>
            <div style={s.enabledRow}>
              <Toggle on={enabled} onChange={setEnabled} />
            </div>
          </FormField>
        </div>
        <FormField
          label={t("modal.fields.body")}
          required
          hint={t("modal.fields.bodyHint", { filename: slugFilename(name), count: approxTokens(body) })}
        >
          <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono />
        </FormField>
        <FormField label={t("modal.fields.agents")} hint={t("modal.fields.agentsHint")}>
          <AgentPicker agents={agents} selected={agentIds} onToggle={(id) => setAgentIds((ids) => toggleId(ids, id))} />
        </FormField>
        {!enabled && agentIds.length > 0 && <div style={s.notice}>{t("modal.disabledWithAgents")}</div>}
      </div>
    </Modal>
  );
}
