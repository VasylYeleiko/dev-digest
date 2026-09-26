/* SkillTypeChip — coloured icon + label chip for a skill's type (rubric /
   convention / security / custom). Shared by the Skills list/sidebar cards and
   the Agent Editor's Skills tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { TYPE_STYLE } from "./constants";
import { s } from "./styles";

export function SkillTypeChip({ type }: { type: SkillType }) {
  const t = useTranslations("skills");
  // Unknown → secondary token, defensive only — every SkillType value is mapped.
  const style = TYPE_STYLE[type];
  const color = style?.color ?? "var(--text-secondary)";
  return (
    <span style={s.chip(color)}>
      {style && React.createElement(Icon[style.icon], { size: 11 })}
      {t(`listItem.type.${type}`)}
    </span>
  );
}
