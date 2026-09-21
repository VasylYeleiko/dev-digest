# Architecture — DI container and adapter ports

How this package wires external dependencies so route handlers never talk to
a concrete SDK, and how a test swaps any of them for a mock without touching
route code. For the request lifecycle of one feature end to end, see
[../specs/review-flow.md](../specs/review-flow.md).

## Composition root: `src/app.ts` → `Container`

`buildApp()` (`src/app.ts`) is the single composition root. It builds a
`Container` (`src/platform/container.ts`) from config + a `Db` handle, attaches
it to the Fastify instance as `app.container`, then registers every feature
module from the static `modules` registry (`src/modules/index.ts`). A route
handler reaches every adapter, repository, and the DB through
`container.<thing>` — nothing is imported directly from `src/adapters/*` by a
route.

```ts
export interface BuildAppOptions {
  config?: AppConfig;
  db?: Db;
  overrides?: ContainerOverrides;   // ← this is the whole test seam
}
```

A test calls `buildApp({ db: testDb, overrides: { llm: { openai: mockProvider } } })`
and every module that resolves `container.llm('openai')` gets the mock,
unmodified. `server/src/adapters/mocks.ts` holds the mock implementations used
across the integration suite.

## Adapters are ports, not SDK wrappers spread across the codebase

Each external dependency has an interface (defined in `@devdigest/shared`'s
`adapters.ts`, e.g. `LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`,
`Embedder`, `SecretsProvider`, `AuthProvider`) and exactly one concrete
implementation folder under `src/adapters/<name>/`:

| Port | Concrete adapter | Notes |
|---|---|---|
| `LLMProvider` | `adapters/llm/openai.ts`, `adapters/llm/anthropic.ts`; OpenRouter comes from `@devdigest/reviewer-core` (shared with the CI runner) | Resolved lazily by id, cached in `llmCache`; secrets are re-read only on cache miss |
| `GitHubClient` | `adapters/github/octokit.ts` | Async getter — constructing it needs an awaited secret read |
| `GitClient` | `adapters/git/simple-git.ts` | Sync getter, memoized |
| `CodeIndex` | `adapters/codeindex/ripgrep.ts` | Depends on `container.git` — adapters can depend on each other through the container, not by importing one another directly |
| `Embedder` | `adapters/embedder/openai.ts` | Throws `ConfigError` **before** constructing anything when `EMBEDDINGS_ENABLED=false` — the zero-OpenAI-calls guarantee lives here, not in a caller |
| `SecretsProvider` | `adapters/secrets/local.ts` | Backs every other adapter's key lookup |
| `AuthProvider` | `adapters/auth/local.ts` | Single-workspace, no-op auth for the course starter |
| `DepGraph`, `Tokenizer` | `adapters/depgraph/`, `adapters/tokenizer/` | repo-intel-only; only the indexer pipeline reads these |

The container getter pattern is consistent across all of them:

```ts
get git(): GitClient {
  if (this.overrides.git) return this.overrides.git;   // 1. test override wins
  this._git ??= new SimpleGitClient(this.config.cloneDir); // 2. lazy construct
  return this._git;                                      // 3. memoize
}
```

Adding a new external dependency means adding an interface to
`adapters.ts`, one concrete class under `src/adapters/<name>/`, one field +
getter on `Container`, and one optional key on `ContainerOverrides` — never a
new ad hoc import inside a route or service.

## Shared repositories live in the container too

`AgentsRepository` and `ReviewRepository` are constructed once in the
container (`container.agentsRepo`, `container.reviewRepo`) rather than inside
the `agents`/`reviews` modules, specifically so a *different* module can read
agent or review data without reaching into another module's folder — e.g.
`pulls/routes.ts`'s list rollups query `t.reviews`/`t.agentRuns` directly (see
[review-flow.md](../specs/review-flow.md)) rather than importing from
`modules/reviews/`.

## Pricing is a container-level concern, not an LLM-adapter concern

`container.priceBook` (`platform/price-book.ts`) fetches live OpenRouter
pricing (6h TTL) with the static `adapters/llm/pricing.ts` table as fallback,
and `buildLlm` injects the same `(model, tokensIn, tokensOut) => priceBook.estimate(...)`
callback into **every** provider's constructor — `OpenAIProvider`,
`AnthropicProvider`, and `OpenRouterProvider` alike — rather than any adapter
hardcoding a table itself. OpenRouter additionally has a real billed
`usage.cost` in its own API response and prefers that over the callback when
present; OpenAI/Anthropic have no such signal, so the injected callback is
their only source.

**Caveat:** `PriceBook`'s live map is keyed by OpenRouter's slug format
(e.g. `anthropic/claude-sonnet-4-6`), while a direct OpenAI/Anthropic call
uses the bare model id (`claude-sonnet-4-6`). A direct call's lookup
therefore typically misses the live map and falls through to `PriceBook`'s
own fallback — the same static `pricing.ts` table the adapter would have
used anyway. So today this wiring mainly buys two things: no adapter
hardcodes a pricing import, and a future slug-normalization fix (mapping a
bare id to its OpenRouter-prefixed equivalent) becomes a one-line change in
`PriceBook` instead of a change in every adapter. Live pricing for a direct
(non-OpenRouter) call is not yet realized.
