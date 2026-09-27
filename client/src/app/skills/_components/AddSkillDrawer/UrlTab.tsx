/* UrlTab — import a skill from a URL. The server fetches it (https only,
   SSRF-guarded, GitHub page links mapped to raw) into a preview with its
   prompt-injection report; nothing persists until Save, which stores it as
   `imported_url` and DISABLED — it has to be vetted before an agent uses it. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { useCreateSkill, useImportSkillFromUrl } from "../../../../lib/hooks/skills";
import { ApiError } from "../../../../lib/api";
import { useToast } from "../../../../lib/toast";
import { ImportPreviewForm } from "./ImportPreviewForm";
import { s } from "./styles";

export function UrlTab({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const fetchPreview = useImportSkillFromUrl();
  const createSkill = useCreateSkill();
  const [url, setUrl] = React.useState("");
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPreview(null);
    try {
      setPreview(await fetchPreview.mutateAsync(url.trim()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("drawer.importFailed"));
    }
  };

  const save = () => {
    if (!preview) return;
    createSkill.mutate(
      {
        name: preview.name,
        description: preview.description,
        type: preview.type,
        body: preview.body,
        source: "imported_url",
        enabled: false,
      },
      {
        onSuccess: (skill) => {
          toast.success(t("url.success", { name: skill.name }));
          onClose();
          router.push(`/skills/${skill.id}?tab=config`);
        },
      },
    );
  };

  return (
    <div>
      <form onSubmit={load} style={s.urlForm}>
        <FormField label={t("url.label")} hint={t("url.hint")}>
          <TextInput value={url} onChange={setUrl} placeholder={t("url.placeholder")} mono />
        </FormField>
        <div style={s.actions}>
          <Button type="submit" kind="primary" icon="Link" disabled={url.trim().length === 0 || fetchPreview.isPending}>
            {fetchPreview.isPending ? t("url.fetching") : t("url.fetch")}
          </Button>
        </div>
      </form>
      {error && (
        <div role="alert" style={s.error}>
          {error}
        </div>
      )}
      {preview && (
        <ImportPreviewForm preview={preview} onChange={setPreview} onSave={save} saving={createSkill.isPending} />
      )}
    </div>
  );
}
