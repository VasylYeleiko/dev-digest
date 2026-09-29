/* CommunityTab — "coming soon". Renders the existing community.* copy with
   every control disabled; not wired to any live mutation (decision #1). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function CommunityTab() {
  const t = useTranslations("skills");
  return (
    <div style={s.disabledBody}>
      <div style={s.picker}>
        <Icon.Search size={16} style={{ color: "var(--text-muted)" }} />
        <span style={s.pickerLabel}>{t("community.searchPlaceholder")}</span>
      </div>
      <div style={s.disabledHint}>Coming soon.</div>
    </div>
  );
}
