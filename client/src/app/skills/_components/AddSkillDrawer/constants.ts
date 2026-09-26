import type { SkillType } from "@devdigest/shared";

/** Drawer width (matches CreateAgentModal's MODAL_WIDTH scale). */
export const DRAWER_WIDTH = 560;

/** Accepted file extensions for the File tab's picker. */
export const ACCEPTED_EXTENSIONS = ".md,.markdown,.zip";

/** Selectable skill types in the import preview's Type field. */
export const SKILL_TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];
