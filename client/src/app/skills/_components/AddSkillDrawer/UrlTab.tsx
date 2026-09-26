/* UrlTab — "coming soon". Renders the existing url.* copy with every control
   disabled; not wired to any live mutation (decision #1 in the Skills plan). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput } from "@devdigest/ui";
import { s } from "./styles";

export function UrlTab() {
  const t = useTranslations("skills");
  return (
    <div style={s.disabledBody}>
      <FormField label={t("url.label")} hint={t("url.hint")}>
        <TextInput value="" onChange={() => {}} placeholder={t("url.placeholder")} disabled />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Link" disabled>
          {t("url.import")}
        </Button>
      </div>
      <div style={s.disabledHint}>Coming soon.</div>
    </div>
  );
}
