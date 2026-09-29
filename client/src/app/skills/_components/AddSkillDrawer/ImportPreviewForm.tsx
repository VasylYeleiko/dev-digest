/* ImportPreviewForm — the editable, not-yet-saved preview of an imported skill,
   shared by the File and URL tabs: the injection report (if any), the
   untrusted-source notice, name/description/type/body, and Save. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Icon, SelectInput, Textarea, TextInput } from "@devdigest/ui";
import type { SkillImportPreview, SkillType } from "@devdigest/shared";
import { InjectionAlert } from "../../../../components/InjectionAlert";
import { SKILL_TYPE_VALUES } from "./constants";
import { s } from "./styles";

export function ImportPreviewForm({
  preview,
  onChange,
  onSave,
  saving,
}: {
  preview: SkillImportPreview;
  onChange: (next: SkillImportPreview) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const t = useTranslations("skills");
  const field =
    <K extends keyof SkillImportPreview>(key: K) =>
    (value: SkillImportPreview[K]) =>
      onChange({ ...preview, [key]: value });

  return (
    <div>
      {preview.injection && <InjectionAlert report={preview.injection} variant="import" />}
      <div style={s.notice}>
        <Icon.AlertTriangle size={16} style={{ flexShrink: 0, color: "var(--warn, #b45309)" }} />
        <span>{t("preview.untrustedNotice")}</span>
      </div>
      <Badge icon="AlertTriangle" color="var(--warn, #b45309)" style={{ marginBottom: 16 }}>
        {t("preview.untrustedBadge")}
      </Badge>
      <FormField label={t("file.nameLabel")} hint={t("file.nameHint")}>
        <TextInput value={preview.name} onChange={field("name")} placeholder={t("file.namePlaceholder")} />
      </FormField>
      <FormField label="Description">
        <TextInput value={preview.description} onChange={field("description")} />
      </FormField>
      <FormField label="Type">
        <SelectInput value={preview.type} onChange={(v) => field("type")(v as SkillType)} options={[...SKILL_TYPE_VALUES]} />
      </FormField>
      <FormField label={t("file.bodyLabel")}>
        <Textarea value={preview.body} onChange={field("body")} rows={8} mono />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={onSave} disabled={saving}>
          {saving ? t("file.importing") : t("preview.save")}
        </Button>
      </div>
    </div>
  );
}
