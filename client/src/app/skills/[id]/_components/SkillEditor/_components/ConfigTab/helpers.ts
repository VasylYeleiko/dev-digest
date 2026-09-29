import type { Skill, SkillType } from "@devdigest/shared";

/** The editable fields of the Config tab — one object instead of five useStates. */
export interface ConfigForm {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
}

/** Initial form state for a skill (the tab is re-mounted per skill via `key`). */
export function formFromSkill(skill: Skill): ConfigForm {
  return {
    name: skill.name,
    description: skill.description,
    type: skill.type,
    body: skill.body,
    enabled: skill.enabled,
  };
}

/** The PUT /skills/:id patch for a form (wire field names — already camelCase
 *  here since the contract's own field names match). */
export function formToPatch(form: ConfigForm) {
  return {
    name: form.name,
    description: form.description,
    type: form.type,
    body: form.body,
    enabled: form.enabled,
  };
}

/** True when the form differs from the loaded skill (drives the "unsaved
 *  changes" badge). */
export function isDirty(form: ConfigForm, skill: Skill): boolean {
  return (
    form.name !== skill.name ||
    form.description !== skill.description ||
    form.type !== skill.type ||
    form.body !== skill.body ||
    form.enabled !== skill.enabled
  );
}
