# server — `@devdigest/api`

Map for this package. Architecture, request/DI flow diagrams and the API map
live in [README.md](README.md) — don't duplicate them here.

## Stack

Fastify 5 (`@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cors`,
`fastify-sse-v2`) · Drizzle ORM · `postgres` · pgvector. Route schemas are Zod
(`src/vendor/shared`) via `fastify-type-provider-zod` — one schema drives
both request validation and response serialization.

## Commands

- `pnpm dev` (`:3001`) · `pnpm build` · `pnpm typecheck`
- `pnpm db:migrate` · `pnpm db:generate` · `pnpm db:seed` (idempotent demo data)
- `pnpm test` — runs both suites; split by filename:
  - unit (hermetic): `pnpm exec vitest run --exclude '**/*.it.test.ts'`
  - integration (real Postgres via testcontainers): `pnpm exec vitest run .it.test`

## Where things are

`src/modules/{agents,polling,pulls,repo-intel,repos,reviews,settings,workspace,_shared}`
— one plugin per domain, routes in `modules/<name>/routes.ts`, registered
statically in `src/modules/index.ts`. `src/adapters/*` — ports (llm, github,
git, astgrep, secrets) swapped for mocks in tests via the DI container
(`src/platform/container.ts`). `src/db/schema/*` — Drizzle schema (every
table for every course lesson already exists; unused ones sit empty until a
lesson fills them). `repo-intel` has its own deeper
[README](src/modules/repo-intel/README.md).

## Non-default conventions

- Validation is schema-first: Zod `params`/`body` reject bad input with `422`
  **before** the handler runs — handlers don't hand-roll `Schema.parse(...)`.
- PR import is an upsert (`pr_repo_number_uq` unique index on
  `repoId+number`), so re-importing the same PR is idempotent, not additive.
- No API keys required to boot — `loadConfig` marks every secret optional;
  `EMBEDDINGS_ENABLED=false` by default means **zero** OpenAI calls until set.

## Naming conventions

- **One plugin folder per domain** under `src/modules/<name>/`, with routes in
  `routes.ts` registered statically from `src/modules/index.ts`. A domain with
  logic too big for one file splits it into `repository.ts` /
  `repository/*.repo.ts` (see `modules/reviews/`) rather than growing
  `routes.ts`; a small pure-derivation helper that needs its own unit coverage
  (`deriveReviewStatus`, `rollupCostByPr`) lives in a sibling `status.ts`-style
  file next to the route, not inline.
- **Tests**: `*.test.ts` is hermetic (mocked adapters, no network); `*.it.test.ts`
  spins up real Postgres via testcontainers and is gated by `dockerAvailable()`.
  Test helpers live under `test/helpers/`.
- **DB columns are `snake_case`** (Postgres convention, via Drizzle's column
  name argument, e.g. `text('run_id')`); the JS-side field on the same table
  definition is `camelCase` (`runId`). Route handlers convert explicitly to the
  wire contract's `snake_case` on the way out — never leak a Drizzle row shape
  straight into a response.
- **Adapters are ports**: one folder per external dependency under
  `src/adapters/<name>/` (llm, github, git, astgrep, secrets, …), swapped for
  mocks in tests via `src/platform/container.ts`'s DI container.

## Gotchas

- Migrations are **not** applied on boot — `pnpm db:migrate` manually.
- The repo map is cached by `(repoId, commitSha, tokenBudget)`
  (`repo_map_cache`); a stale cache after a force-push needs the repo
  re-indexed, not just re-reviewed.
- `INJECTION_GUARD` (assembled in `reviewer-core/prompt.ts`, fed inputs from
  `modules/reviews/run-executor.ts`) is the **only** prompt-injection
  defense — there is deliberately no keyword denylist. Don't add one; it only
  catches one phrasing and gives false confidence.
- Grounding is mandatory: every finding must cite a real diff line
  (`groundFindings`) and the score is recomputed from survivors — the
  model's self-reported score is never trusted.
- `REPO_INTEL_ENABLED` defaults to `true`; an **unindexed** repo silently
  degrades the prompt to diff-only rather than erroring.

## Do not touch

- `src/db/migrations/*` — drizzle-kit generated.
- `src/vendor/shared` — vendored copy of `@devdigest/shared`, edit the source
  package instead.
- `pnpm-lock.yaml` — regenerate via `pnpm install`, never hand-edit.

## Read When

- Touching the DI container or an adapter port →
  [docs/architecture.md](docs/architecture.md)
- Touching the review-run flow (import → run → grounding → persist) →
  [specs/review-flow.md](specs/review-flow.md)
- Touching run cost → [specs/0001-run-cost.md](specs/0001-run-cost.md)
- Anything in this package → [INSIGHTS.md](INSIGHTS.md) first,
  [TESTING.md](../TESTING.md) before writing a test
