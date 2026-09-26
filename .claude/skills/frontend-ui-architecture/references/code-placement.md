# Code placement: constants, helpers, types, business logic, data

Read when deciding where a non-component piece of code lives.

## Constants

- **Colocate first.** A constant used by one component lives in that
  component's `constants.ts` (or at the top of its file if it's one or two
  values). Promote to `lib/` only on a second consumer in another feature.
- **`CONSTANT_CASE` only for true module-level constants** — values intended
  never to change (`MAX_RETRIES`, `SEVERITY_ORDER`). Local variables stay
  `camelCase` even if never reassigned (Google TS style guide).
- **Export individual `const`s**, not a class or object used as a namespace
  for unrelated values. A lookup map that *is* one concept
  (`SEVERITY_LABELS`) is fine as one object; mark it `as const`.
- **Name magic values** that encode a decision (thresholds, limits, timeouts,
  breakpoints). Don't name self-evident values (`0`, `1`, `""`).
- **Config ≠ constants.** Environment-dependent values come from one config
  module (or the API client) — nothing else reads `process.env`. User-facing
  strings belong to i18n messages, not constants.

## Helpers, lib, utils — the vocabulary

| Term | Meaning in this skill | Location |
|---|---|---|
| `helpers.ts` | Pure, domain-aware functions private to one component or feature | Inside that folder |
| `lib/<name>.ts` | Project-wide modules: API client, providers, domain helpers used by several features | `src/lib/` |
| generic utility | Domain-agnostic (string/date/array) function | `src/lib/`, named specifically (`dates.ts`), and only when a dependency or the platform doesn't already do it |

Avoid a catch-all `utils.ts`/`helpers.ts` at the root: nobody knows what's in
it, so nobody deletes anything from it.

## Business logic

Business logic = rules the product owner would recognize: calculations
(cost, score), eligibility/permission checks, status derivation, sorting and
grouping with domain meaning, mapping API data to what the UI shows.

- Write it as **pure TypeScript functions** with no React imports. Input →
  output, no hidden reads.
- **Components and hooks call it; they don't contain it.** The hook wires
  state/data to the function; the component renders the result.
- If the logic needs a dependency (API client, clock, storage), **pass it in**
  as a parameter and wrap it in a thin hook — the function stays unit-testable
  (Kettmann's use-case + hook pattern).
- When variants multiply (per-country, per-provider rules), use a strategy
  map/object instead of `if` chains spread across components (Fowler's fix
  for shotgun surgery).
- Placement follows the promotion ladder: `helpers.ts` → feature `lib/` →
  `src/lib/<domain>.ts`.

Smell test: *can I unit-test this rule without rendering anything?* If not,
it's in the wrong place.

## Data layer (server state)

- **One path from API to component**: API client (`lib/api.ts`) → data hooks
  (one module per API resource) → components. Components never call `fetch`
  or the API client directly — that's what makes components mockable with one
  hook and keeps error handling uniform.
- **One query-key factory per resource**, next to its hooks:

  ```ts
  const pullKeys = {
    all: ["pulls"] as const,
    list: (repoId: string) => [...pullKeys.all, "list", repoId] as const,
    detail: (repoId: string, n: number) => [...pullKeys.all, "detail", repoId, n] as const,
  };
  ```

  Export the hooks; keep raw keys and query functions module-private unless
  another module genuinely needs to invalidate them.
- **Map DTOs at the edge.** Wire contracts are `snake_case`; convert to the
  camelCase view model in the data layer or a mapper helper, field by field,
  so components never depend on wire names.
- Mutations live in the same resource module as the queries they invalidate.

## Types

- A type used by one module lives in that module.
- Types shared within a component folder → `types.ts` in the folder.
- Types shared across features → `src/lib/types.ts` or a domain module.
- Wire/DB contract types come from the shared contracts package — don't
  redeclare them.
- Derive rather than duplicate (`z.infer`, `ReturnType`, `Pick`).
