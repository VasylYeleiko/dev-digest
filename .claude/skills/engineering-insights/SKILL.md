---
name: engineering-insights
description: Reads and appends engineering insights to the per-package INSIGHTS.md (client, server, reviewer-core, e2e). Use at the start of a task to load what past sessions learned about that package, and at the end of a task to record a non-obvious finding — a gotcha, a dead end, a convention, a dependency quirk, or a decision and its reason. Also use when the user asks to capture, record, or wrap up learnings.
---

# Engineering insights

Per-package memory. Each package owns an `INSIGHTS.md`; a session reads the one
it's working in, and appends to it only when it learned something worth the next
session's attention.

## Append-only — never overwrite

Only ever *add* entries. Never edit, reorder or delete an existing one — not
even one you wrote yourself and now disagree with. A superseded entry is
corrected by a **new** dated entry that names it. Pruning is human-initiated
(see Maintenance); never do it mid-session.

This is a rule about tools, not just intent:

- **Use `Edit`. Never use `Write` on an `INSIGHTS.md` that already exists** —
  `Write` replaces the whole file and silently destroys every existing entry.
  There is no case where this skill regenerates a file from scratch.
- **Read the file in full first** — the whole file, not an `offset`/`limit`
  slice. You cannot know whether an entry is already there, or what you are
  about to displace, from a partial read.
- **Anchor the edit on the target `##` section heading** and insert immediately
  after it, so the new entry lands newest-first inside that section. Keep
  `old_string` to the heading plus a line or two — never span existing entries.
- **Change nothing else.** No reflowing, re-wrapping, typo fixes, re-sorting,
  heading renames, or edits to the file's header paragraph. If an existing entry
  is wrong, add a correcting entry; leave its text byte-identical.
- **One entry per `Edit` call.** Batching several into one edit is how
  neighbouring text gets swallowed.
- **If a `##` section is missing**, add just that heading. Never restructure the
  file or regenerate its scaffolding to "fix" it.

After editing, confirm every pre-existing entry is still present and unchanged.
If anything was lost, restore it before continuing — `git diff` on the file
should show only additions.

**The only file this skill modifies is the package's `INSIGHTS.md`.** Each
`INSIGHTS.md` header invites promoting a load-bearing note into `CLAUDE.md` —
that is an instruction to the human, not to you. Say the entry looks worth
promoting and let the user decide; never edit `CLAUDE.md`, `README.md` or any
other file from this skill.

## Which file

| Work touches | Write to |
|---|---|
| `client/**` | `client/INSIGHTS.md` |
| `server/**` (incl. `src/modules/repo-intel`) | `server/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**` | `e2e/INSIGHTS.md` |

Work spanning several packages goes to the most-affected one. Work fitting none
(root tooling, `docker-compose.yml`, `scripts/`) is not recorded.

## Step 1 — Read first

Once the request identifies the package, read its `INSIGHTS.md` **before editing
anything**. Apply what's under *What Works* and *Codebase Patterns*; avoid
what's under *What Doesn't Work*. State in one or two lines which entries bear
on this task — the confirmation forces actual processing and catches a silent
failure to read.

Required even when the session will clearly write nothing.

## Step 2 — Capture as you go

When something non-obvious surfaces mid-session — the user corrects a wrong
assumption, an approach fails for a structural reason, a decision gets made —
note it then, rather than reconstructing it later. Don't write to the file yet;
hold candidates for Step 3.

## Step 3 — Wrap up

Worth running for a session that hit a real problem, decision, or discovery
(roughly 30 minutes and up). A trivial session skips to "nothing to record" —
that is the correct outcome for most sessions, and writing filler is worse than
writing nothing.

Rank candidates by signal strength:

1. **Somewhere the user corrected you** — strongest signal. A correction is
   proof the codebase contradicted a reasonable default.
2. A failure and what actually fixed it.
3. A decision and the reason behind it.
4. A convention or quirk found by reading the code.

**Cap at 3 entries.** More than that means the bar was too low.

A candidate must pass **all four** filters:

- **Recurrent** — likely to come up again, not a one-time edit.
- **Non-inferable** — not obvious to anyone reading the code. *If it would be
  obvious, don't write it.*
- **Stable** — about something not actively being rewritten this week.
- **Project-specific** — true of *this* repo, not of TypeScript in general.

Never record a one-time fix, a task-specific decision, or anything already in
`CLAUDE.md` or the package `README.md`. Never paper over bad tooling — if a
command keeps being forgotten because it's awkward, fix the command.

Then, before appending: read the target file **in full** and check for an
existing entry on the same point. Already covered → append nothing. Contradicts
one → append a new dated entry that names it, leaving the old one untouched.

Append the entry with a single `Edit` anchored on its `##` section heading — see
*Append-only* above; never `Write`. Then show the entry in your response so the
user can veto it, and confirm the file's existing entries are all still there.

## Sections

Eight fixed `##` headings, entries newest-first inside each:

What Works · What Doesn't Work · Codebase Patterns · Tool & Library Notes ·
Decisions · Recurring Errors & Fixes · Session Notes · Open Questions

`Decisions` holds a choice *and the reason for it* — the thing that otherwise
gets re-litigated every session. `What Doesn't Work` is the most-skipped and
most valuable section; a dead end you don't record is one the next session
walks into.

## Entry format

Date + category + substance + evidence. The section is the category:

```markdown
### YYYY-MM-DD — short title

One to three sentences. Cite the evidence as `path/file.ts:42`.
```

Lead with the why, use real commands and real symbols, bullets over paragraphs,
no hedging. Phrase a *What Doesn't Work* entry as an absolute: "never strip …",
"always re-index after …".

The bar: an agent reading it **cold**, with no memory of this session, knows
what to do or avoid. If you can't be that specific, don't write it yet.

❌ "Promises can be tricky"
✅ "`Promise.all()` on the ingest pipeline times out after 30 items — use
`Promise.allSettled()` with batches of 10"

❌ "watch out for caching"
✅ "the repo map is cached by `(repoId, commitSha, tokenBudget)` in
`repo_map_cache`, so a force-push needs the repo re-indexed, not just
re-reviewed — `server/src/modules/repo-intel`"

## Maintenance

Human-initiated, and the one exception to append-only. Roughly monthly, or when
a file passes ~30 entries: merge duplicates, drop entries whose bug is fixed,
delete what no longer matches the code, archive resolved Open Questions. A stale
entry is worse than a missing one — it propagates into every future session
until someone corrects it.

If a file keeps overflowing after pruning, split it by domain rather than let
signal-to-noise drop.

Never prune on your own. Report that a file is over the limit; the deletion is
the user's call.
