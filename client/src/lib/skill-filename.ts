/** `{slug-of-name}.md` — the filename shown under a skill-body editor.
 *  Shared by the Skill editor and the Conventions "Create skill" modal. */
export function slugFilename(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return `${slug || "skill"}.md`;
}
