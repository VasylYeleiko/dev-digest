# Grounding — the mandatory citation gate and score recomputation

The one behavior this package commits to for every finding that reaches a
caller: a finding must cite a real location in the diff, or it does not
survive. For where this sits in the larger pipeline, see
[../docs/pipeline.md](../docs/pipeline.md).

## The rule (`src/grounding.ts`)

`groundFindings(findings, diff)` runs once, after `reduceReviews`, regardless
of whether single-pass or map-reduce produced the findings — it is **not**
duplicated per strategy. For each finding:

1. **The file must be in the diff.** If `finding.file` doesn't match any
   `diff.files[].path`, it's dropped — reason: `"file '<path>' not present in
   diff"`.
2. **A diff-finding's line range must intersect a real hunk.** Ordinary
   findings (`kind` unset, or `kind: 'finding'`) are kept only if
   `[start_line, end_line]` intersects the new-side line numbers of some hunk
   in that file (`buildLineIndex` + `rangeIntersects`). A finding whose lines
   don't land in any hunk is dropped — reason: `"lines N-M do not intersect
   any diff hunk in '<path>'"`. This is what catches a model hallucinating a
   line number that doesn't exist in the actual change.
3. **Full-file finding kinds are exempt from the line check.** `secret_leak`,
   `lethal_trifecta`, `phantom`, and `hook` (`FULL_FILE_KINDS`) come from
   scanners that examine the whole file, not a diff hunk — for these, step 1
   (file present) is the entire gate.

Nothing else about a finding — its severity, category, confidence, rationale
— is grounding's concern. A finding can be perfectly well-formed and still be
dropped for citing a line the diff doesn't touch.

## Why this exists

An LLM can assert "line 47 has a hardcoded secret" without that line existing
in the actual diff — plausible-sounding, ungroundable, and if shown to the
user, undermines trust in every other finding. Grounding is the mechanical
backstop: no keyword matching, no second LLM call to "verify" the first one
(that would just be a second hallucination risk) — a pure, deterministic
range-intersection check against the diff the model was actually given.

## The score is recomputed from survivors, never from the model

`reviewPullRequest` calls `scoreFromFindings(ground.kept)` — **after**
grounding, on the **kept** set only — and discards whatever `score` the model
put in its own structured output entirely. `review/reduce.ts`'s
`SEVERITY_PENALTY` (`CRITICAL: 35, WARNING: 12, SUGGESTION: 3`, subtracted
from a perfect 100, floored at 0) is the one and only source of the number the
UI renders as PR SCORE. This matters beyond hallucination-resistance: two
different models scoring the same findings would otherwise disagree even when
they agree on every finding, because raw LLM-reported scores have no shared
anchor and drift wildly between providers. Grounding + deterministic scoring
together guarantee the score on screen can never contradict the findings
listed beneath it — see `reviewer-core/CLAUDE.md`'s Do-not-touch on
`SEVERITY_PENALTY`.

## What "never trust the model's self-reported score" costs

A finding's own `confidence` (0–1, model-reported) is **not** touched by
grounding and is **not** part of `scoreFromFindings` — confidence only drives
client-side UI (the "hide low confidence" filter, sort order within a
severity). Grounding is binary (kept/dropped); there is no partial-credit
path for a finding that's "probably" grounded.

## Acceptance

1. A finding citing a file not in the diff is always dropped, regardless of
   `kind`.
2. A `kind: 'finding'` (or unset) citing lines outside every hunk in its file
   is dropped; one citing lines that intersect any hunk is kept.
3. A `secret_leak`/`lethal_trifecta`/`phantom`/`hook` finding is kept whenever
   its file is in the diff, independent of its line numbers.
4. Every dropped finding carries a human-readable reason, surfaced via
   `onEvent` (`'info'`, `grounding dropped "<title>": <reason>`) and in the
   run trace — grounding failures are visible, never silent.
5. The review's `score` always equals `scoreFromFindings` on the **post-
   grounding** finding set — never the model's own `score` field, never the
   pre-grounding set.
