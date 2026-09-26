import type { IconName } from "@devdigest/ui";
import type { SkillSource } from "@devdigest/shared";

/** Skill source → icon (badge label comes from i18n `skills.listItem.source.*`). */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  imported_url: "Link",
  extracted: "Upload",
  community: "Globe",
};
