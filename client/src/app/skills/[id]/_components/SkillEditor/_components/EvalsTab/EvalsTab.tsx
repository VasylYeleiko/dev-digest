/* EvalsTab — static placeholder. No eval runner exists yet (not built for
   agents either); out of scope this pass. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export function EvalsTab() {
  const t = useTranslations("skills");
  return <EmptyState icon="FlaskConical" title={t("evals.comingSoon")} />;
}
