import { SkillType } from "@devdigest/shared";

/** Modal width (px) — wide enough for a readable Markdown body. */
export const MODAL_WIDTH = 680;

/** Rows of the Markdown body editor. */
export const BODY_ROWS = 12;

/** Type preselected for a skill written from scratch. */
export const DEFAULT_TYPE: SkillType = "custom";

/** Selectable skill types — straight from the contract enum. */
export const SKILL_TYPE_VALUES: readonly SkillType[] = SkillType.options;

/** Shape hint for an empty body: a heading, then directive rules. */
export const BODY_PLACEHOLDER = "# Rule\n\nFlag …";
