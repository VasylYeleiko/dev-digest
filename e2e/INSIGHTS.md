# e2e/INSIGHTS

Append-only log of gotchas, decisions, and "why is it done this way" notes for
this package. Newest entry on top within each section, dated. Entries are only
ever added — a superseded note is corrected by a new dated entry, never edited
in place. When a note here turns out to be load-bearing for every session,
promote its one-line summary into [`CLAUDE.md`](CLAUDE.md) instead of leaving it
buried.

Written by the `engineering-insights` skill. Format:
`### YYYY-MM-DD — short title` + one to three sentences citing
`specs/NN-name.flow.json` or `src/lib/*.ts`.

## What Works

## What Doesn't Work

### 2026-09-20 — `./scripts/e2e.sh` / `npm test` cannot run locally on Windows — always `spawn EINVAL`

`run.ts`'s `ab()` helper calls `execFile(BIN, args, {...})` with no `shell`
option (`run.ts`'s `exec = promisify(execFile)`). On Windows, `npm i -g
agent-browser` installs a `.cmd` shim (plus a `.ps1` and an extensionless
POSIX shim) — there is no native `.exe`. Node's `child_process.execFile`
refuses to spawn a `.cmd`/`.bat` directly without `shell: true` (EINVAL,
regardless of whether `AGENT_BROWSER_BIN` points at the plain name or an
explicit `...\agent-browser.cmd` path, POSIX- or Windows-style). All 8 flows
fail identically with the same error, including ones that predate any given
session — this is not something a spec or seed change can trigger or fix.
CI is unaffected: `.github/workflows/e2e-web.yml` runs on `ubuntu-latest`,
where the global install is a real binary. On Windows, verify a UI change
manually against the running dev stack instead of trying to get the hermetic
runner green locally.

## Codebase Patterns

## Tool & Library Notes

## Decisions

## Recurring Errors & Fixes

## Session Notes

### 2026-09-17 — CLAUDE.md/INSIGHTS scaffolding added

Seeded this file alongside `CLAUDE.md`. No `docs/` folder for this package —
`README.md` + `specs/` already cover flow format and coverage; add `docs/` later
if a topic genuinely doesn't fit either. No entries yet beyond what's already
inlined as gotchas in `CLAUDE.md` (never `down -v`, flows need a freshly-seeded
single-repo DB).

## Open Questions
