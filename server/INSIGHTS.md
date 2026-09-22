# server/INSIGHTS

Append-only log of gotchas, decisions, and "why is it done this way" notes for
this package. Newest entry on top within each section, dated. Entries are only
ever added — a superseded note is corrected by a new dated entry, never edited
in place. When a note here turns out to be load-bearing for every session,
promote its one-line summary into [`CLAUDE.md`](CLAUDE.md) instead of leaving it
buried.

Written by the `engineering-insights` skill. Format:
`### YYYY-MM-DD — short title` + one to three sentences citing `file.ts:42`.

## What Works

## What Doesn't Work

### 2026-09-18 — `indexer-pipeline.test.ts` always fails 6/11 on Windows

Never assume your change broke it. `writeFileAt` builds its path with
`join(root, rel)` — backslashes on Windows — then looks for the parent via
`full.lastIndexOf('/')`, which returns `-1`, so the `mkdir` is skipped and
`writeFile` dies with `ENOENT … \src\a.ts`. The rest of the unit lane is green
(96 passed), so a red run with exactly these 6 is the known baseline. Confirm
any suspicion with `git stash push --include-untracked` + re-run, and restore
with `git stash pop`. The fix, when someone takes it, is `dirname(full)`
instead of the manual slash search. Evidence: `test/indexer-pipeline.test.ts:140-145`.

## Codebase Patterns

### 2026-09-20 — `SimpleGitClient.fetchPullHead()` existed, fully implemented, and had ZERO callers

A shallow clone (`CLONE_DEPTH=1`, `simple-git.ts`'s `clone()`) only ever
tracks the default branch, so an open PR's head commit is never locally
reachable — `git diff base...head` throws "unknown revision" for
essentially every real (non-merged) PR reviewed. `fetchPullHead()` exists
specifically to fix this (fetches GitHub's `pull/<n>/head`), is fully
implemented, and even has a mock in `adapters/mocks.ts` — but before this
session nothing called it anywhere in the codebase (confirmed by a
repo-wide grep). The symptom was silent and confusing: `loadDiff`'s
try/catch swallowed the throw and fell through to a DB-reconstructed diff
that was *also* usually empty, so every agent "reviewed" an empty diff and
correctly said "approve, nothing to review" — never an error, never a hint
what went wrong. Grep for zero callers on anything that "exists to solve
exactly this problem" before assuming the problem is unsolved. Evidence:
`src/modules/reviews/diff-loader.ts` (now calls it), `src/adapters/git/simple-git.ts:72-75`.

### 2026-09-18 — `@devdigest/shared` is TWO hand-mirrored copies, not a package

`CLAUDE.md` lists `src/vendor/shared` under "Do not touch — edit the source
package instead". **That source package does not exist in this repo.** There are
only `server/src/vendor/shared/` and `client/src/vendor/shared/`, resolved by
tsconfig path alias and kept in sync by hand; adding a contract field means
editing both in lock-step or the client silently loses the field. Verify with
`diff server/src/vendor/shared/contracts/trace.ts client/src/vendor/shared/contracts/trace.ts`
— the only legitimate differences are comments.

## Tool & Library Notes

### 2026-09-20 — testing `container.ts`'s `buildLlm` DI wiring can't use the normal `overrides.llm` test pattern

`Container.llm(id)` checks `overrides.llm?.[id]` FIRST and returns it
immediately if set (`platform/container.ts`), which is exactly why every
existing integration test injects a `MockLLMProvider` that way — but it
also means those tests never execute `buildLlm` itself, so they can't catch
a regression in what `buildLlm` passes into a real provider's constructor.
To test `buildLlm`'s wiring, either `vi.mock` the concrete adapter modules
(`adapters/llm/openai.js`/`anthropic.js`) and construct a bare `Container`
directly, or accept you're only testing the mock's own behavior. If you do
construct a bare `Container` with a stub `SecretsProvider` that returns a
truthy value for any key, make `OPENROUTER_API_KEY` explicitly return
`undefined` — `container.priceBook`'s lazy refresh treats *any* truthy
OpenRouter key as "try a real network call" (wrapped in try/catch, so it
won't throw, but it will actually attempt one and make the test slow/flaky).
Evidence: `test/container-llm.test.ts`, `src/platform/container.ts:140-151`.

## Decisions

### 2026-09-20 — `seed.ts`'s demo review is created with no `run_id`, inside the `if (!pr)` block, before the built-in agents exist

The sample review + findings (`seed.ts:137-176`) are inserted while creating
PR #482 for the first time, but linking them to an `agent_runs` row (so the
PR detail TIMELINE has a real run to render, not just a bare commit) needs an
`agentId` — and the built-in agents aren't seeded until *after* that block
(`seed.ts:179-222`). A run insertion has to happen in a separate pass after
the agents loop, re-querying the review by `prId` + `kind: 'review'` (the
local `review` binding from the PR-creation block is out of scope by then) and
guarding on `reviews.runId` being null so re-seeding stays idempotent per this
file's stated contract. Evidence: `src/db/seed.ts` (the "demo agent run"
block after the agents loop).

### 2026-09-19 — a regression test for removing a time-window heuristic must backdate a timestamp

Two runs triggered back-to-back in a testcontainers test (`waitForPrRuns`)
complete milliseconds apart — well inside any plausible time window — so a
naive "trigger twice, assert the sum" test passes identically on windowed and
non-windowed code and proves nothing. Confirmed by reverting `rollupCostByPr`
and re-running: the test only fails pre-fix once one run's `ran_at` is pushed
back an hour via a direct `update()`. Evidence: `test/reviews.it.test.ts`
("PR-list COST sums every successful run" test), `src/modules/pulls/status.ts`.

### 2026-09-18 — fields added to a jsonb-embedded contract must be optional

`RunStats` lives inside the `run_traces.trace` jsonb document, so rows written
before a field existed have no such key. New fields there get `.nullish()`, not
`.nullable()` — `.nullable()` still requires the key present and would reject
every historical trace on any future re-validation. Contracts rebuilt from a DB
row on each read (`RunSummary`) have no such constraint and stay `.nullable()`.
Evidence: `src/vendor/shared/contracts/trace.ts`, `src/platform/trace-builder.ts:56`.

## Recurring Errors & Fixes

### 2026-09-19 — `db:migrate` and `db:seed` were silent no-ops on Windows

Both CLI entrypoints guarded on ``import.meta.url === `file://${process.argv[1]}` ``,
which never matches on Windows — `process.argv[1]` is `C:\…\migrate.ts` while
`import.meta.url` is `file:///C:/…/migrate.ts`. The body never ran, the script
exited **0**, and `scripts/dev.sh` reported success, so the API booted against an
empty database and failed with `relation "agent_runs" does not exist`. Always
check for the `✓ migrations applied` / `✓ seeded` line — exit 0 alone proves
nothing. Fixed with `pathToFileURL(process.argv[1]).href` at
`src/db/migrate.ts:37` and `src/db/seed.ts:228`; same class of bug as the
`indexer-pipeline.test.ts` entry above.

## Session Notes

### 2026-09-17 — CLAUDE.md/docs/specs/INSIGHTS scaffolding added

Seeded this file alongside `CLAUDE.md`, `docs/`, and `specs/` for the package.
No entries yet beyond what's already inlined as gotchas in `CLAUDE.md`
(migrate-on-boot, repo-map cache staleness, `INJECTION_GUARD`).

## Open Questions
