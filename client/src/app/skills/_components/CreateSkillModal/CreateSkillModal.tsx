/* CreateSkillModal — "Add Skill → Create skill": a skill written from scratch
   (name, description, type, Markdown body). Opened from the Skills list and the
   Skill editor's sidebar; on save it opens the new skill's editor. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, Textarea, TextInput, Toggle } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { approxTokens } from "../../../../lib/tokens";
import { slugFilename } from "../../../../lib/skill-filename";
import { BODY_PLACEHOLDER, BODY_ROWS, DEFAULT_TYPE, MODAL_WIDTH, SKILL_TYPE_VALUES } from "./constants";
import { s } from "./styles";

export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState("");

  const submittable =
    name.trim().length > 0 && description.trim().length > 0 && body.trim().length > 0 && !create.isPending;

  const submit = () =>
    create.mutate(
      { name: name.trim(), description: description.trim(), type, body, enabled, source: "manual" },
      {
        onSuccess: (skill) => {
          toast.success(t("create.success", { name: skill.name }));
          onClose();
          router.push(`/skills/${skill.id}?tab=config`);
        },
      },
    );

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={!submittable}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {create.isError && (
          <div role="alert" style={s.error}>
            {create.error.message}
          </div>
        )}
        <FormField label={t("create.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("create.namePlaceholder")} />
        </FormField>
        <FormField label={t("create.description")} required>
          <TextInput value={description} onChange={setDescription} placeholder={t("create.descriptionPlaceholder")} />
        </FormField>
        <div style={s.row}>
          <FormField label={t("create.type")}>
            <SelectInput
              value={type}
              onChange={(v) => setType(v as SkillType)}
              options={SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }))}
            />
          </FormField>
          <FormField label={t("create.enabled")}>
            <div style={s.toggleRow}>
              <Toggle on={enabled} onChange={setEnabled} />
            </div>
          </FormField>
        </div>
        <FormField
          label={t("create.body")}
          required
          hint={t("create.bodyHint", { filename: slugFilename(name), count: approxTokens(body) })}
        >
          <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono placeholder={BODY_PLACEHOLDER} />
        </FormField>
      </div>
    </Modal>
  );
}
