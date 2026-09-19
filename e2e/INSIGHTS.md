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
