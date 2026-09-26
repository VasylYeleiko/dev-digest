# Review flow — the full cycle from PR import to a PR-list row

The contract this package commits to for "run a review and see it reflected
everywhere it should be." For the DI/adapter shape that makes this
mockable, see [../docs/architecture.md](../docs/architecture.md). For the
run-cost half specifically, see [0001-run-cost.md](0001-run-cost.md).

## 1. Import (`pulls` module, `PullService.listForRepo`)

`GET /repos/:id/pulls` is also the sync point: when a GitHub token is
configured it fetches the repo's pull requests and upserts them
(`repoId+number` unique index — re-importing is idempotent, never additive),
then serves the read regardless of whether the sync succeeded (local-first:
an already-imported PR stays viewable offline). Diff stats
(`additions`/`deletions`/`files_count`) aren't on GitHub's list payload, so
they're backfilled from the detail endpoint, capped at 10 PRs per request.

## 2. Trigger (`POST /pulls/:id/review`)

Body is `{ agentId }` (one agent), `{ agentIds: [...] }` (a hand-picked
subset) or `{ all: true }` (every enabled agent); an empty body is accepted
by the route schema and rejected by the service with `400 invalid_run_request`.
`ReviewService.resolveTargets` turns it into a list of `AgentEntity`. The route
is **fire-and-forget**: it creates a `running` `agent_runs` row per target
agent, returns `{ pr_id, runs, reviews: [] }` immediately with the run ids,
and kicks off `ReviewRunExecutor.executeRuns(...)` un-awaited
(`void executor.executeRuns(...).catch(...)`, `modules/reviews/service.ts`).
A client that needs the persisted review polls `GET /pulls/:id/reviews` or
subscribes to `GET /runs/:id/events` (SSE) — the POST response never carries
one.

Rate-limited at 10 calls/minute per the route config — each call can fan out
to real, billed LLM calls.

## 3. Execution (`ReviewRunExecutor`, `modules/reviews/run-executor.ts`)

One diff + intent load is shared across every queued agent
(`RunLogger` fans its buffer out to every target run's log up front); a
failure at this stage fails every queued run with `status: 'failed'`,
`costUsd: null`, and a persisted trace, never partially.

Per agent, `runOneAgent`:

1. Resolves the agent's `LLMProvider` via the injected `LLMProviderResolver` —
   a missing API key throws `ConfigError`, caught and persisted as a failed
   run, not a 500.
2. Builds repo-intel context (callers digest, repo-map skeleton, rank note) —
   all best-effort; when the agent has repo-intel off, or the facade can't
   answer, the prompt degrades to the pre-repo-intel shape rather than
   erroring (see `server/AGENTS.md`'s Gotchas on `REPO_INTEL_ENABLED`).
3. Calls `reviewPullRequest(...)` — the **entire** pure pipeline
   (assemble → LLM → structured parse → grounding) lives in
   `@devdigest/reviewer-core`; this module supplies only I/O (context
   resolution above, persistence below). See
   [reviewer-core/specs/grounding.md](../../reviewer-core/specs/grounding.md)
   for what happens inside that call.
4. Persists, in order: the review row (`insertReview`), its grounded findings
   (`insertFindings`), the PR's `lastReviewedSha` (`PullStore.markReviewed` — this is
   what `deriveReviewStatus` reads to decide needs_review/reviewed/stale on
   the list), then completes the `agent_runs` row (`completeAgentRun`) with
   `status: 'done'`, token counts, `costUsd` (read off the engine outcome,
   **never recomputed** — see 0001-run-cost.md), `findingsCount`, `grounding`,
   `score`, and `blockers` (a deterministic count from `countBlockers`, gated
   on the agent's `ciFailOn` threshold — **not** the model's self-reported
   verdict).

A per-agent failure (including a mid-run cancel, `RunCancelledError`) is
isolated: it's caught, logged, and does not stop the remaining queued agents.

## 4. What the PR-list row reads back

`GET /repos/:id/pulls` never re-runs anything — it's three on-read rollups
over already-persisted rows, orchestrated by `PullService.listForRepo`, all the
same shape (one `inArray` query in `PullRepository` + JS grouping in the pure
helpers of `modules/pulls/helpers.ts` / `status.ts`):

| List field | Source | Helper |
|---|---|---|
| `score` | the PR's newest `reviews` row (`kind='review'`) | `latestReviewByPr` |
| `findings`, `findings_preview` | `findings` rows of that same newest review | `rollupSeverities`, `previewFindings` |
| `cost_usd` | **every** `status='done'` `agent_runs` row for the PR, summed all-time | `rollupCostByPr` |

`score`/`findings` and `cost_usd` intentionally read from **different**
scopes — the former is "the latest review," the latter is "everything ever
spent on this PR" — because a re-reviewed PR should show its current quality
next to its cumulative cost, not the cost of only the run that produced that
score. See [0001-run-cost.md](0001-run-cost.md) for why the cost side has no
time window.

## Acceptance

1. Triggering a review returns immediately with run ids; the persisted review
   appears via polling/SSE once execution finishes.
2. One agent's failure never blocks or fails a sibling agent's run in the same
   batch.
3. A grounded finding is the only kind of finding that reaches the database —
   see reviewer-core's grounding spec for what "grounded" means.
4. The PR list's SCORE/FINDINGS always reflect the latest review; its COST
   always reflects every successful run, independent of how long ago it ran.
