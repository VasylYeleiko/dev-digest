# PR body template

Write `.claude/pr-self-review/pr-body.md` from `last-run.json` when the verdict
is PASS, unless the run used `--no-pr-body`. Replace every `{{…}}`. Drop any
section that would be empty.

- **Summary**: write it yourself from `git log --oneline <base>..HEAD` and the
  diff. It says **what** changed and **why**, not a list of files.
- Everything else comes from `last-run.json`. Do not add findings that are not
  in it.

---

```markdown
## Summary

{{2–4 sentences: what this PR changes and why}}

## Changes

| Package | Reviewed by |
|---|---|
| {{package}} | {{skills routed to that package's files}} |

## Checks

{{one line per entry in checksRan, e.g. "✅ server — typecheck · ✅ server — tests"}}

## Self-review

`/pr-self-review` **PASS**: 0 CRITICAL · {{WARNING}} WARNING · {{SUGGESTION}} SUGGESTION

### Known warnings

- `{{file}}:{{line}}`: {{rule}} ({{skill}})

### Accepted findings

- `{{file}}`: {{rule}}, *{{reason}}* (until {{expires}})

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Hand it to GitHub with `gh pr create --body-file .claude/pr-self-review/pr-body.md`.
Only do that when the user asked for the PR to be opened.
