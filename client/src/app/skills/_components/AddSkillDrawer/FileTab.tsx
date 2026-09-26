/* FileTab — the only interactive tab of AddSkillDrawer. Pick a .md/.zip file,
   parse it server-side into a preview (nothing persists), let the user tweak
   name/type before confirming, then create the skill. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput, SelectInput, Textarea, Badge, Icon } from "@devdigest/ui";
import type { SkillImportPreview, SkillType } from "@devdigest/shared";
import { useCreateSkill, useImportSkill } from "../../../../lib/hooks/skills";
import { ApiError } from "../../../../lib/api";
import { useToast } from "../../../../lib/toast";
import { SKILL_TYPE_VALUES } from "./constants";
import { fileToBase64 } from "./helpers";
import { s } from "./styles";

export function FileTab({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const importSkill = useImportSkill();
  const createSkill = useCreateSkill();
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const pickFile = async (file: File) => {
    setError(null);
    setPreview(null);
    setFileName(file.name);
    try {
      const content_base64 = await fileToBase64(file);
      const result = await importSkill.mutateAsync({ filename: file.name, content_base64 });
      setPreview(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("drawer.importFailed"));
    }
  };

  const field =
    <K extends keyof SkillImportPreview>(key: K) =>
    (value: SkillImportPreview[K]) =>
      setPreview((p) => (p ? { ...p, [key]: value } : p));

  const save = () => {
    if (!preview) return;
    createSkill.mutate(
      { name: preview.name, description: preview.description, type: preview.type, body: preview.body, source: "extracted" },
      {
        onSuccess: (skill) => {
          toast.success(t("file.success", { name: skill.name }));
          onClose();
          router.push(`/skills/${skill.id}?tab=config`);
        },
      },
    );
  };

  return (
    <div>
      <label style={s.picker}>
        <Icon.Upload size={16} style={{ color: "var(--text-muted)" }} />
        <span style={s.pickerLabel}>{fileName ?? "Choose a .md or .zip file…"}</span>
        <input
          type="file"
          accept=".md,.markdown,.zip"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void pickFile(file);
            e.target.value = "";
          }}
        />
      </label>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>{t("file.bodyHint")}</div>

      {importSkill.isPending && <div style={s.pickerLabel}>{t("file.importing")}</div>}
      {error && <div style={s.error}>{error}</div>}

      {preview && (
        <div>
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
            <SelectInput
              value={preview.type}
              onChange={(v) => field("type")(v as SkillType)}
              options={[...SKILL_TYPE_VALUES]}
            />
          </FormField>
          <FormField label={t("file.bodyLabel")}>
            <Textarea value={preview.body} onChange={field("body")} rows={8} mono />
          </FormField>
          <div style={s.actions}>
            <Button kind="primary" icon="Check" onClick={save} disabled={createSkill.isPending}>
              {createSkill.isPending ? t("file.importing") : t("preview.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
