/* InjectionBadge — red "Injection detected" chip for a skill whose body carries
   prompt-injection patterns. Shared by the Skills list/sidebar cards, the
   Skill editor header, and the Agent editor's Skills tab. */
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";

export function InjectionBadge() {
  const t = useTranslations("skills");
  return (
    <Badge icon="AlertOctagon" color="var(--crit)" bg="var(--crit-bg)">
      {t("injection.badge")}
    </Badge>
  );
}
