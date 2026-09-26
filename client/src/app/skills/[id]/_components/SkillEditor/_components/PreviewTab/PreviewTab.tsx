/* PreviewTab — renders the skill's body as the reviewing agent receives it.
   Reuses the vendored `Markdown` primitive (react-markdown + remark-gfm under
   the hood) rather than importing react-markdown directly, for consistency
   with every other Markdown surface in this app. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <div style={s.caption}>{t("previewTab.caption")}</div>
      <div style={s.card}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
