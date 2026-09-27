import { ConventionCategory } from "@devdigest/shared";

/** Confidence thresholds (percent) for the bar colour. */
export const CONFIDENCE_OK = 80;
export const CONFIDENCE_WARN = 60;

/** Category options for the inline editor — straight from the contract enum. */
export const CATEGORY_VALUES: readonly ConventionCategory[] = ConventionCategory.options;

/** Rows of the inline rule editor. */
export const RULE_EDITOR_ROWS = 3;
