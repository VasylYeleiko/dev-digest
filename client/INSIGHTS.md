# client/INSIGHTS

Append-only log of gotchas, decisions, and "why is it done this way" notes for
this package. Newest entry on top within each section, dated. Entries are only
ever added — a superseded note is corrected by a new dated entry, never edited
in place. When a note here turns out to be load-bearing for every session,
promote its one-line summary into [`CLAUDE.md`](CLAUDE.md) instead of leaving it
buried.

Written by the `engineering-insights` skill. Format:
`### YYYY-MM-DD — short title` + one to three sentences citing `file.tsx:42`.

## What Works

## What Doesn't Work

## Codebase Patterns

### 2026-09-18 — in `FindingsTab`, `runs` is NOT the runs

`FindingsTab` takes both `runs: ReviewRecord[]` (the persisted **reviews**) and
`prRuns: RunSummary[]` (the **agent runs**, which carry status, tokens and
cost). Per-run telemetry only exists on `prRuns`; reach it from a review via
`prRuns.find(r => r.run_id === review.run_id)`, which can legitimately miss when
the run was deleted. Reading the names instead of the prop types silently yields
`undefined`. Evidence: `src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:17`.

## Tool & Library Notes

## Decisions

## Recurring Errors & Fixes

## Session Notes

### 2026-09-17 — CLAUDE.md/docs/specs/INSIGHTS scaffolding added

Seeded this file alongside `CLAUDE.md`, `docs/`, and `specs/` for the package.
No entries yet beyond what's already inlined as a gotcha in `CLAUDE.md`
(component tests mock `fetch`, real journeys live in `e2e/`).

## Open Questions
