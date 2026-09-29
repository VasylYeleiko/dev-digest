/* FileTab — pick a .md/.zip file, parse it server-side into a preview
   (nothing persists), let the user tweak it before confirming, then create
   the skill. The preview form is shared with UrlTab. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { useCreateSkill, useImportSkill } from "../../../../lib/hooks/skills";
import { ApiError } from "../../../../lib/api";
import { useToast } from "../../../../lib/toast";
import { fileToBase64 } from "./helpers";
import { ImportPreviewForm } from "./ImportPreviewForm";
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
        <ImportPreviewForm preview={preview} onChange={setPreview} onSave={save} saving={createSkill.isPending} />
      )}
    </div>
  );
}
