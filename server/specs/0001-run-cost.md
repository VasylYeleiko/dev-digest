# 0001 — Run cost

Status: implemented · Lesson: L01 · Spans: `server/`, `client/`

Per-run generation cost (USD), persisted on `agent_runs` and surfaced on four
UI surfaces. Cross-package: the client half is indexed from
[`client/specs/README.md`](../../client/specs/README.md).

## Problem

DevDigest spends real money on every review and never shows it. The cost is
already computed — `reviewer-core` returns `ReviewOutcome.costUsd` — and was
then dropped on the floor in `modules/reviews/run-executor.ts` before reaching
the database. You could not answer "what did reviewing this PR cost?" from the
product.

The column existed in `0000_init.sql` and was removed by
`0009_complex_runaways.sql`. This re-introduces it.

## Non-goals

- **No new model calls.** Cost is read from the outcome, never recomputed and
  never fetched from OpenRouter's `/generation` endpoint.
- **No backfill.** Runs that completed before this change stay `null`.
- **No cost on `reviews`.** `reviews.run_id` has no FK to `agent_runs`
  (`db/schema/reviews.ts:19`), so `deleteAgentRun` already deletes the review by
  hand. Denormalizing cost onto both would be a second thing to keep in sync.

## Where the number comes from

Nothing new is computed. The chain already existed end to end:

| Stage | Where |
|---|---|
| Real billed USD | `reviewer-core/src/llm/openrouter.ts` — sends `usage: { include: true }` and reads OpenRouter's `usage.cost` |
| Estimate fallback | `server/src/platform/price-book.ts` (live prices, 6h TTL) → `server/src/adapters/llm/pricing.ts` (static table); injected at `platform/container.ts` |
| Per-run total | `reviewer-core/src/review/run.ts` — summed per chunk into `ReviewOutcome.costUsd` |

`reviewer-core` sums cost across map-reduce chunks and goes `null` if **any**
chunk was unpriced. That is deliberate: a partial sum would under-report, and
under-reporting cost is worse than admitting we don't know.

## Data model

```sql
ALTER TABLE "agent_runs" ADD COLUMN "cost_usd" double precision;
```

`doublePrecision('cost_usd')`, nullable — matching the existing precedent on
`ci_runs.cost_usd` and `eval_runs.cost_usd`.

The null is load-bearing:

| Value | Means | UI |
|---|---|---|
| `0.0013` | Priced run | `$0.0013` |
| `0` | Genuinely free model | `$0.00` |
| `null` | Un-priced model, failed/cancelled run, or a run from before this change | `—` |

`null` and `0` must stay visually distinct. "We don't know" is not "it was free".

## API contract

| Contract | Field | Endpoint |
|---|---|---|
| `RunSummary` | `cost_usd: z.number().nullable()` | `GET /pulls/:id/runs` |
| `RunStats` | `cost_usd: z.number().nullish()` | `GET /runs/:id/trace` |
| `PrMeta` | `cost_usd: z.number().nullish()` | `GET /repos/:id/pulls` |

`RunStats` is **optional**, not merely nullable, because it lives inside the
`run_traces.trace` jsonb document and traces persisted before this change have
no such key — they must still parse. `RunSummary` is rebuilt from a DB row on
every read, so plain `.nullable()` is correct there.

Responses on these routes are plain TS return types (only `params` are
Zod-validated), so no route schema changed.

## PR-list rollup — all successful runs

The list's COST column is **the sum of every successful run, all-time**, not
just the latest one: a PR that gets re-reviewed a week later should show
cumulative spend, not the newest agent's slice. "Review all" fans out N agents
within seconds, and re-reviewing later adds more runs on top — every one of
them counts.

`modules/pulls/routes.ts` sums all `status='done'` priced runs for the PR via
the pure `rollupCostByPr` helper (`modules/pulls/status.ts`). Computed on read
via one `inArray` query plus JS grouping — the same shape as the `score` block
directly above it, and never denormalized onto `pull_requests`. There is no
time window: a PR reviewed once today and again next month shows the sum of
both.

## UI surfaces

One component, `client/src/components/RunCostBadge`, with three variants, plus
`formatCost` in `client/src/lib/cost.ts`.

| Surface | Component | Renders |
|---|---|---|
| PR list COST column | `PRRow.tsx` | `$0.014` |
| Agent-runs timeline | `RunHistory.tsx` | `9,119 tok · $0.0013` under the timestamp, settled runs only |
| Run trace drawer | `TraceBody.tsx` | A fourth `Stat` card, COST |
| Verdict banner | `VerdictBanner.tsx` | `$0.014 · 8k→1.3k` on the title row |

`formatCost` widens precision as the value shrinks (≈2 significant figures) so a
sub-cent run reads `$0.0013` rather than rounding to `$0.00`, then trims
trailing zeros to a 2dp floor.

The verdict banner is the one surface that renders **nothing** for an un-priced
run rather than `—`: it is a summary surface, and an empty slot reads better
there than a dangling dash. It also needs no server data of its own —
`FindingsTab` already holds both the reviews and the runs, so the cost is
matched client-side on `run_id`.

## Acceptance criteria

1. A completed run persists its cost; every read path returns the same value.
2. PR list shows COST between STATUS and UPDATED = the sum of every
   successful run for the PR, all-time; no priced run → `—`.
3. Settled timeline runs show total tokens · cost; running runs show nothing.
4. The trace drawer shows COST beside DURATION / TOKENS / FINDINGS.
5. The verdict banner shows cost · tokens for a priced run.
6. Missing cost renders `—`, never `$0.00`.
7. A free model renders `$0.00`, not `—`.
8. Zero additional LLM calls.

## Open questions

- **JS grouping over SQL `sum()`.** `rollupCostByPr` groups in JS to match the
  `score` block's convention and to unit-test hermetically without Docker
  (`server/test/pulls-status.test.ts`). Revisit only if the PR list ever
  paginates past a few hundred rows — a `sum()` + `group by` would then be
  cheaper, at the cost of losing hermetic coverage to the `.it.test.ts` suite.
- **Cached and reasoning tokens are ignored.** OpenRouter returns
  `prompt_tokens_details.cached_tokens` and
  `completion_tokens_details.reasoning_tokens`; we read neither. This only
  affects the estimate path — when OpenRouter reports a real `usage.cost`, that
  figure already accounts for them.
