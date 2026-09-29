import type { IconName } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";

/** Skill type → chip colour + icon (mirrors AgentCard's per-model chip). */
export const TYPE_STYLE: Record<SkillType, { color: string; icon: IconName }> = {
  rubric: { color: "#3b82f6", icon: "ListChecks" },
  convention: { color: "#10b981", icon: "FileText" },
  security: { color: "#ef4444", icon: "Shield" },
  custom: { color: "#8b5cf6", icon: "Wrench" },
};
