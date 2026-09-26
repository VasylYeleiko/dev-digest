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

The package is layered as an **onion** — every import points toward the
domain. The rules live in the `onion-architecture` skill
(`.claude/skills/onion-architecture/`); [docs/architecture.md](docs/architecture.md)
maps them onto this code.

`src/modules/{agents,polling,pulls,repo-intel,repos,reviews,settings,workspace,_shared}`
— one plugin per domain, registered statically in `src/modules/index.ts`.
`src/adapters/<name>/` — the only place a vendor SDK / filesystem / child
process is touched; each class implements a port from
`src/vendor/shared/adapters.ts` and is built lazily by the DI container
(`src/platform/container.ts`), which tests override with mocks.
`src/db/schema/*` — Drizzle schema (every table for every course lesson
already exists; unused ones sit empty until a lesson fills them). `repo-intel` has its own deeper
[README](src/modules/repo-intel/README.md).

## Non-default conventions

- `src/vendor/shared` **is** the source of `@devdigest/shared` — there is no
  upstream package; edit it in place. `reviewer-core` compiles against this
  copy. Mirror any `contracts/*` change into `client/src/vendor/shared/` in the
  same change (the client has no `adapters.ts` — ports are server-side only).
- Validation is schema-first: Zod `params`/`body` reject bad input with `422`
  **before** the handler runs — handlers don't hand-roll `Schema.parse(...)`.
- PR import is an upsert (`pr_repo_number_uq` unique index on
  `repoId+number`), so re-importing the same PR is idempotent, not additive.
- No API keys required to boot — `loadConfig` marks every secret optional;
  `EMBEDDINGS_ENABLED=false` by default means **zero** OpenAI calls until set.

## Naming conventions

- **One folder per domain** under `src/modules/<name>/`, with a fixed set of
  file roles: `types.ts` (camelCase entities) · `ports.ts` (`XStore`
  persistence port) · `constants.ts` · `helpers.ts` / `status.ts`-style pure
  files · `service.ts` (takes a `Deps` object of ports, never the Container)
  · `repository.ts` or `repository/*.repo.ts` (the only Drizzle code; returns
  entities, not `$inferSelect` rows) · `index.ts` (public API for other
  modules — types/ports/constants only) · `compose.ts` (builds repository +
  service from the Container) · `routes.ts` (thin handlers: request context →
  one service call). See `modules/repos/` for the smallest complete example.
- **Tests**: `*.test.ts` is hermetic (mocked adapters, no network); `*.it.test.ts`
  spins up real Postgres via testcontainers and is gated by `dockerAvailable()`.
  Test helpers live under `test/helpers/`.
- **DB columns are `snake_case`** (Postgres convention, via Drizzle's column
  name argument, e.g. `text('run_id')`); the JS-side field on the same table
  definition is `camelCase` (`runId`). Route handlers convert explicitly to the
  wire contract's `snake_case` on the way out (pure mappers in the module's
  `helpers.ts`) — never leak a Drizzle row shape straight into a response.
- **Ports live on the consumer side**: interfaces for external systems and
  platform services in `src/vendor/shared/adapters.ts`; a module's persistence
  port in its `ports.ts`; never an interface inside `src/adapters/`.

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
- `pnpm-lock.yaml` — regenerate via `pnpm install`, never hand-edit.

## Read When

- Adding or moving anything under `src/` (module, route, service, repository,
  adapter, port) → the `onion-architecture` skill, then
  [docs/architecture.md](docs/architecture.md)
- Touching the DI container or an adapter port →
  [docs/architecture.md](docs/architecture.md)
- Touching the review-run flow (import → run → grounding → persist) →
  [specs/review-flow.md](specs/review-flow.md)
- Touching run cost → [specs/0001-run-cost.md](specs/0001-run-cost.md)
- Anything in this package → [INSIGHTS.md](INSIGHTS.md) first,
  [TESTING.md](../TESTING.md) before writing a test
