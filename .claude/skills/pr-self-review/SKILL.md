---
name: pr-self-review
description: "Pre-PR self review of every local change on the branch (commits since origin/main + staged + unstaged + untracked). Deterministic checks first, then each change is routed to the matching review skills (UI skills on client/, onion/fastify/drizzle on server/, security/typescript/zod across both) and reviewed by parallel subagents. Any CRITICAL finding blocks the PR. Use before opening a pull request, before `gh pr create`, `gh pr merge` or `git push`, when the pr-gate hook denies one of those, or when the user asks for a self review, pre-PR check or 'is this ready for a PR?'. Args: --quick, --skills=a,b, --full, --no-pr-body."
---

# PR self review

This skill reviews the local change set before a PR exists. **Any CRITICAL
finding means the PR must not be opened or merged.** The PreToolUse hook
`.claude/hooks/pr-gate.mjs` enforces this. It denies `gh pr create`,
`gh pr merge` and `git push` unless the last **full** run is PASS for exactly
the current changes, compared by content hash.

Everything runs from the repo root. Scripts are dependency-free Node. Run them
with `node`, never `pnpm`.

## Hard rules

- **Read-only.** Never fix findings, commit, push or open the PR as part of
  this skill. Report, propose fixes, and stop.
- **Never write to `.claude/pr-self-review/accepted.json`.** Only propose an
  entry for the user to add (see step 7).
- **Never set `PR_SELF_REVIEW_BYPASS`.** It is the user's emergency hatch.
  Mention that it exists only if the user asks how to override the gate.
- A verdict is only as good as its hash. Any edit after the run invalidates
  it, and that is intended.

## Arguments

| Arg | Effect |
|---|---|
| *(none)* | Full run: checks, then every routed skill. Cached (skill, file) pairs are reused. |
| `--full` | Same as a full run, but ignores the cache (`cache.mjs plan --fresh`). Reviewers still run when the checks already found a CRITICAL. |
| `--quick` | Checks plus `security` only. Useful for iterating. **It never unlocks the gate.** |
| `--skills=a,b` | Checks plus the named skills only. **It never unlocks the gate.** |
| `--no-pr-body` | Skip writing `pr-body.md` on PASS. |

## Workflow

### 1. Routing

```bash
node .claude/skills/pr-self-review/scripts/diff-state.mjs
```

This prints the base, the hash, the changed packages and the skill → file
counts. If there are no changed files, say so and stop.

- Report `UNROUTED` skills (new skills that are neither in `routing.json` nor
  in `nonReview`) as a warning. Propose a `routing.json` entry for each; do not
  add it.
- Report routing entries for skills that don't exist.

### 2. Deterministic checks

```bash
node .claude/skills/pr-self-review/scripts/checks.mjs
```

This covers:
- typecheck and hermetic tests for every changed package;
- migration drift, hand-edited migrations and migration names;
- the `vendor/shared` contract mirror;
- lock files without a `package.json` change;
- secrets in added lines;
- new modules without a test (WARNING). Client tests sit next to the module;
  `server/` and `reviewer-core/` tests go in `test/<module>*.test.ts`.

It writes `.claude/pr-self-review/checks.json`. Typecheck and tests can take a
few minutes.

If `counts.CRITICAL > 0` and `--full` was **not** given, skip steps 3–5 and
run step 6 with `--llm-skipped`. Burning reviewer tokens on a change that
doesn't typecheck is waste.

### 3. Plan and cost

```bash
node .claude/skills/pr-self-review/scripts/cache.mjs plan [--fresh] [--quick | --skills=a,b]
```

This writes `.claude/pr-self-review/plan.json`. For each skill it lists
`cached` files, `pending` files, `chunks` (one subagent each) and `model`.

Show the user a compact table: skill · files · cached · subagents · model.

If `totals.agents > 8` or `totals.pending > 60`, warn about cost and time, and
mention `--quick` or `--skills=`. Then **continue**: the warning is
informational.

### 4. Parallel reviewers

For every chunk in the plan, launch one `general-purpose` subagent. **Send all
of them in a single message** so they run in parallel.

- Pass `model: "haiku"` when the plan says `haiku`. Omit `model` for `inherit`.
- The prompt is `references/reviewer-prompt.md`, with its slots filled:
  - `{{ROOT}}`: the repo root;
  - `{{SKILL}}`: the skill name;
  - `{{BASE_SHA}}`: `base.sha` from the plan;
  - `{{PACKAGE}}`: the chunk's top-level folder, or the most common one if the
    chunk is mixed;
  - `{{FILES}}`: one path per line;
  - `{{N}}`: the number of files.

Each subagent returns a JSON array. Parse it leniently: strip a stray code
fence. Then drop any finding that:
- has no `file`, `line` or `evidence`;
- names a file that wasn't in that chunk.

If a subagent fails or returns garbage, rerun that one chunk once. If it fails
again, leave the chunk out of `reviewed`. The pairs then show up as `missing`,
and the verdict becomes INCOMPLETE rather than a false PASS.

### 5. Verify CRITICALs, then record

For **every** reviewer CRITICAL, open the file at `line` yourself and check
the claim against the real code and `references/severity.md`.
- If it is confirmed, keep it and add `"verified": true`.
- If it is not, set `"severity": "WARNING"` and add
  `"downgraded": "<one-line reason>"`.

This pass is what keeps false positives from blocking PRs. Do not skip it.

Then write `.claude/pr-self-review/llm-findings.json`:

```json
{
  "hash": "<plan.json hash>",
  "reviewed": { "<skill>": ["<every file the successful subagents covered>"] },
  "findings": [ /* verified findings from this run only */ ]
}
```

Include files with zero findings in `reviewed`. That is what caches them as
clean. If every pair was cached, skip this file.

`verdict.mjs` consumes this file: it stores the findings in the cache, then
deletes it. If the file belongs to an older change set, the script discards it
(`staleLlmFindings: true`), and those pairs show up as `missing`.

### 6. Verdict

```bash
node .claude/skills/pr-self-review/scripts/verdict.mjs [--quick | --skills=a,b] [--llm-skipped]
```

Pass the same selection flags as in step 3. The script:
1. stores fresh findings in the cache;
2. merges them with the cached findings and the check findings;
3. dedupes findings on the same file:line across skills;
4. applies `accepted.json`;
5. writes `last-run.json` and `report.md`.

| Exit | Meaning |
|---|---|
| 0 | PASS |
| 1 | BLOCKED or INCOMPLETE |
| 2 | Usage error or stale input. Re-run the step it names. |

| Verdict | When |
|---|---|
| **BLOCKED** | ≥1 CRITICAL left after accepted.json |
| **INCOMPLETE** | No CRITICAL, but some routed (skill, file) pairs were never reviewed (`missing`), or reviewers were skipped |
| **PASS** | Everything reviewed, no CRITICAL |

### 7. Report to the user

Read `.claude/pr-self-review/report.md` and present it:

- **The verdict first**, with the counts.
- **CRITICAL** findings, each one with a clickable `[file:line](file:line)`,
  the rule, the evidence and a concrete fix. Then the WARNINGs.
  SUGGESTIONs as a count plus the top few.
- On **BLOCKED**: state plainly that the PR must not be opened or merged until
  these are fixed. Offer to fix them only if the user asks. Tell them to re-run
  `/pr-self-review` afterwards: only the edited files are re-reviewed, and the
  rest comes from the cache.
- If the user disputes a CRITICAL as a false positive, propose an
  `accepted.json` entry for them to add. They add it themselves; it's
  reviewed in the PR. Check findings can't be accepted.

  ```json
  { "skill": "…", "rule": "…", "file": "…", "match": "<substring of the evidence>",
    "reason": "<why this is not a bug>", "expires": "<YYYY-MM-DD, ≤ 90 days out>", "by": "<github user>" }
  ```
- On **INCOMPLETE**: list what wasn't reviewed and re-run.
- On **PASS**: unless `--no-pr-body` was given, write
  `.claude/pr-self-review/pr-body.md` following `references/pr-body.md`, and say
  the gate is open for this exact change set.
- A `--quick` or `--skills` run: say explicitly that the gate stays closed
  until a full run passes.

## Files

| Path | Role |
|---|---|
| `routing.json` | skill → globs, `contentTrigger`, `model`, `chunkSize`; global `exclude`, `nonReview` |
| `references/severity.md` | The one severity rubric, and the mapping from each skill's own scale |
| `references/reviewer-prompt.md` | Subagent prompt template and output schema |
| `references/pr-body.md` | PR description template |
| `scripts/diff-state.mjs` | Change set, routing, content hash (shared with the hook) |
| `scripts/checks.mjs` | Deterministic checks |
| `scripts/cache.mjs` | Incremental cache and review plan |
| `scripts/verdict.mjs` | Merge, dedupe, accepted.json, verdict, report |
| `.claude/hooks/pr-gate.mjs` | PreToolUse gate, registered in `.claude/settings.json` |
| `.claude/pr-self-review/` | Local state (gitignored), except the shared `accepted.json` |

Tests (Node ≥22 takes globs, not directories):
`node --test ".claude/skills/pr-self-review/scripts/*.test.mjs" ".claude/hooks/*.test.mjs"`

## Limits

- The gate only sees commands the agent runs. A `git push` from the user's own
  terminal, or the Merge button on GitHub, bypasses it. Enforcing on the
  server needs branch protection plus a CI check.
- Reviewers judge added and changed lines only. Pre-existing problems in
  untouched code are out of scope.
