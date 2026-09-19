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

### 2026-09-18 — `@devdigest/shared` is TWO hand-mirrored copies, not a package

`CLAUDE.md` lists `src/vendor/shared` under "Do not touch — edit the source
package instead". **That source package does not exist in this repo.** There are
only `server/src/vendor/shared/` and `client/src/vendor/shared/`, resolved by
tsconfig path alias and kept in sync by hand; adding a contract field means
editing both in lock-step or the client silently loses the field. Verify with
`diff server/src/vendor/shared/contracts/trace.ts client/src/vendor/shared/contracts/trace.ts`
— the only legitimate differences are comments.

## Tool & Library Notes

## Decisions

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
