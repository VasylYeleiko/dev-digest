# Pipeline — prompt → LLM → structured → grounding → reduce

The shape of `reviewPullRequest` (`src/review/run.ts`), the package's single
public entry point. For the grounding gate specifically (what "kept" vs
"dropped" means and why the score is recomputed), see
[../specs/grounding.md](../specs/grounding.md).

## Why this is pure

This package performs **no I/O beyond the injected `LLMProvider`** — no DB,
GitHub, filesystem, memory retrieval, or persistence. That's what makes
`reviewPullRequest` callable from two different hosts with two different
persistence models: the server (`modules/reviews/run-executor.ts`, persists
to Postgres + streams SSE) and the CI runner (posts a comment + writes an
artifact). Everything host-specific — resolving skill slugs to bodies, repo
context, secrets, database writes — stays in the caller; this package only
ever sees already-resolved strings (`ReviewInput.skills`/`memory`/`specs` are
bodies, not slugs) and one injected `LLMProvider`.

## The stages, in call order

```
assemblePrompt (prompt.ts)
  → LLMProvider.completeStructured (llm/openrouter.ts, injected)
    → parse-with-repair (llm/structured.ts)
  → reduceReviews (review/reduce.ts)         — only when map-reduce ran >1 chunk
  → groundFindings (grounding.ts)            — the mandatory citation gate
  → scoreFromFindings (review/reduce.ts)     — recomputed from GROUNDED findings
```

1. **`assemblePrompt`** (`prompt.ts`) builds the message list from the
   trusted system prompt plus a fixed set of *optional* slots — `skills`,
   `memory`, `specs`, `callers`, `repoMap`, `prDescription`, `task` — each
   wrapped with `wrapUntrusted` and omitted entirely (not empty-rendered)
   when the caller doesn't supply it. The server's starter config only ever
   passes diff + system prompt + repo map; later course lessons feed the
   rest. See `reviewer-core/AGENTS.md`'s Gotchas for why `INJECTION_GUARD`
   here must never become a keyword denylist.
2. **Single-pass vs map-reduce** (`selectMode` in `run.ts`) — `'auto'` (the
   default) picks map-reduce only when the diff is **both** larger than
   `DEFAULT_MAP_THRESHOLD_LINES` (400) **and** touches more than one file;
   otherwise (and always for `'single-pass'`) the whole diff goes in one
   `completeStructured` call. In map-reduce mode, one call is made per file
   (`sliceDiff` extracts that file's hunk from the raw diff), each producing a
   partial `Review`.
3. **Structured output** (`llm/structured.ts`) turns the `Review` Zod schema
   into a JSON Schema for the provider's structured-output mode, and retries
   with a repair prompt up to `maxRetries` (default `DEFAULT_REVIEW_MAX_RETRIES`
   = 2) on a malformed response.
4. **Reduce** (`review/reduce.ts`'s `reduceReviews`) — only runs when there's
   more than one partial: concatenates findings, takes the **worst** verdict
   across chunks (`request_changes` > `comment` > `approve`), means the
   per-chunk scores, and joins summaries. A single-pass review skips this
   (`partials.length === 1` returns that one partial as-is).
5. **Grounding** (`grounding.ts`) — the **one** gate that runs regardless of
   which mode produced the findings; see the dedicated spec.
6. **Final score** — `scoreFromFindings` runs on `ground.kept`, **not** on the
   model's self-reported `score` and **not** on the pre-grounding merged set.
   This is why grounding matters beyond "did the model hallucinate a line
   number": it's also the thing the visible score is actually derived from.

## What the caller gets back (`ReviewOutcome`)

Beyond the grounded `review`, the outcome carries everything a caller needs to
persist an observable run without recomputing anything: `tokensIn`/`tokensOut`,
`costUsd` (summed across chunks — `null` if **any** chunk was unpriced, per
[server's cost spec](../../server/specs/0001-run-cost.md)'s "under-reporting is
worse than admitting we don't know" rule), `grounding` (a human-readable
`"N/M passed"` string), `dropped` (each dropped finding + why, for the trace —
grounding failures are never silently swallowed), `mode`, `assembly` (for the
run trace's prompt viewer), and `chunks` (per-chunk labels for the trace's
tool-call list).

## Cancellation and progress

`ReviewInput.checkCancelled` is polled before each chunk's LLM call — the
engine stays agnostic to *how* cancellation is represented (the server throws
its own `RunCancelledError`; this package just calls the callback and lets
whatever it throws propagate). `ReviewInput.onEvent` is the progress sink: the
server forwards these into its SSE bus and the run's persisted log; the CI
runner forwards them into its own log. Both call sites are 1:1 wrappers —
neither reinterprets the event stream.
