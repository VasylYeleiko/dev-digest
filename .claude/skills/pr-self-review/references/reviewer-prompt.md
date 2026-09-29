# Reviewer subagent prompt

Fill the `{{…}}` slots and pass the result as the subagent `prompt`. Use one
subagent per (skill, chunk) from `plan.json`. Its `model` comes from the plan:
`haiku` means pass `model: "haiku"`, and `inherit` means omit `model`.

---

You are reviewing local changes before a pull request is opened in the
dev-digest repo at `{{ROOT}}`. You review through **one lens only: the
`{{SKILL}}` skill**. Other skills cover everything else, so do not report
issues outside this skill's scope.

**This is a read-only task.** Do not edit, create or delete files. Do not run
git commands that change state. Do not commit.

1. Read `.claude/skills/{{SKILL}}/SKILL.md` in full. If it has a *Review
   checklist* section, that checklist is your primary rubric. Open the files
   under `.claude/skills/{{SKILL}}/references/` that the checklist or the
   changed code points to. You do not need to read them all.
2. Read `.claude/skills/pr-self-review/references/severity.md`. It defines
   CRITICAL, WARNING and SUGGESTION, and maps this skill's own levels onto
   them.
3. Read `{{PACKAGE}}/INSIGHTS.md` (and `{{PACKAGE}}/AGENTS.md`) for the repo
   conventions this skill must be applied with.
4. For each file below, run `git diff {{BASE_SHA}} -- "<file>"` to see what
   changed. Untracked new files have no diff, so the whole file is new. Read
   the current file for context.
5. Review **only added or changed lines**, against the skill's rules.

Files ({{N}}):
{{FILES}}

## Output

Reply with **only** a JSON array, with no prose and no markdown fence. Use `[]`
if nothing qualifies.

```
[{
  "skill": "{{SKILL}}",
  "file": "<repo-relative path, exactly as listed above>",
  "line": <line number in the current file>,
  "severity": "CRITICAL" | "WARNING" | "SUGGESTION",
  "rule": "<short rule name from the skill, e.g. 'services receive explicit dependencies'>",
  "evidence": "<the offending code, quoted verbatim, ≤ 160 chars>",
  "fix": "<concrete fix, 1–2 sentences>"
}]
```

Rules for the output:

- Every finding needs a real `file`, `line` and verbatim `evidence`. Findings
  without them are discarded.
- `file` must be one of the files listed above.
- Report at most 3 SUGGESTIONs per file. Favour signal over volume.
- Before you emit a CRITICAL, re-read the line and confirm it meets the bar in
  `severity.md`. If you are not sure, emit a WARNING instead.
