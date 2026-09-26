"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Textarea, Toggle, Button, Badge } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { SKILL_TYPE_VALUES } from "./constants";
import { approxTokens, formFromSkill, formToPatch, isDirty, slugFilename, type ConfigForm } from "./helpers";
import { s } from "./styles";

/**
 * Config tab — name/description/type/body + enabled toggle. Render it with
 * `key={skill.id}`: switching skills re-mounts the tab, which resets the form
 * (no effect copying props into state) — mirrors the agents ConfigTab.
 */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [form, setForm] = React.useState<ConfigForm>(() => formFromSkill(skill));
  const field =
    <K extends keyof ConfigForm>(key: K) =>
    (value: ConfigForm[K]) =>
      setForm((f) => ({ ...f, [key]: value }));
  const { name, description, type, body, enabled } = form;
  const dirty = isDirty(form, skill);
  const tokens = approxTokens(body);
  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: formToPatch(form) },
      {
        // Failures are surfaced by the global mutation error toast; confirm the
        // save with a success toast (not just the inline "Saved (vN)" note).
        onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })),
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        {dirty && (
          <Badge color="var(--warn, #b45309)" bg="var(--warn-bg, rgba(180,83,9,0.1))">
            {t("config.unsaved")}
          </Badge>
        )}
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={field("enabled")} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={field("name")} />
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionHint")} required>
        <TextInput value={description} onChange={field("description")} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => field("type")(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField
        label={t("config.body")}
        hint={`${t("config.filename", { filename: slugFilename(name) })} · ${t("config.tokenCount", { count: tokens })}`}
      >
        <Textarea value={body} onChange={field("body")} rows={14} mono />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
