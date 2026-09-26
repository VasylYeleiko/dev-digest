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

/** Approximate prompt tokens contributed by this skill's body. Mirrors the
 *  server's `approxTokens` heuristic (reviewer-core's tokenizer adapter:
 *  ~4 chars/token) so the live counter matches what the run trace will show
 *  as `skills_tokens` once this skill is linked to an agent. */
export function approxTokens(body: string): number {
  return Math.ceil(body.length / 4);
}

/** `{slug-of-name}.md` — the filename shown under the body field. */
export function slugFilename(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return `${slug || "skill"}.md`;
}
