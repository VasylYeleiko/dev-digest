# reviewer-core — `@devdigest/reviewer-core`

Map for this package. The pipeline diagram lives in [README.md](README.md)
— don't duplicate it here.

## Stack

Pure TypeScript, no DB/GitHub/filesystem access. The **only** side effect is
an LLM call through an injected `LLMProvider`, which is what makes the
engine mock-testable. `pnpm build` is a type-check only — the package never
emits JS; consumers (the server) import the TS source via a tsconfig path
alias.

## Commands

- `pnpm test` (vitest) — hermetic, stubbed `LLMProvider`, no keys/network
- `pnpm typecheck` — doubles as the build

## Pipeline (file map)

`prompt.ts` (`assemblePrompt`, `wrapUntrusted` + `INJECTION_GUARD`) →
injected `LLMProvider` (`llm/openrouter.ts`) → `llm/structured.ts`
(Zod → JSON Schema, parse-with-repair) → `grounding.ts` (`groundFindings`,
the mandatory citation gate) → `review/run.ts` (orchestrates the run,
single-pass by default) → `review/reduce.ts` (`reduce`, map-reduce merge).
Public surface: `src/index.ts`. Contracts (`Review`, `Finding`, `Verdict`)
come from `@devdigest/shared`.

## Non-default conventions

- `assemblePrompt` accepts optional slots (`skills`, `memory`, `specs`,
  `callers`) that later course lessons feed — the starter server only passes
  diff + system prompt + repo map, so those sections are simply omitted, not
  empty-rendered.

## Gotchas

- Never strip `wrapUntrusted`/`INJECTION_GUARD` from `prompt.ts` — it's the
  only prompt-injection defense, deliberately not a keyword denylist.
- Grounding is mandatory: a finding that doesn't cite a real diff line is
  dropped by `groundFindings`, and the score is recomputed from survivors —
  never trust the model's self-reported score.

## Do not touch

- `SEVERITY_PENALTY` weights (in `review/reduce.ts`) without checking the
  score contract the client renders against.

## More

[docs/](docs/) · [specs/](specs/) ·
[INSIGHTS.md](INSIGHTS.md) — read before working in this package ·
[TESTING.md](../TESTING.md)
