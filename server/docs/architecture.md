# Architecture — onion rings, ports and composition

How this package keeps business rules independent of Postgres, Fastify and
vendor SDKs, and how a test swaps any of them for a mock without touching a
service. The rules themselves (what each ring may import, where each kind of
code goes) live in the `onion-architecture` skill
([../../.claude/skills/onion-architecture/SKILL.md](../../.claude/skills/onion-architecture/SKILL.md));
this page maps them onto the code. For the request lifecycle of one feature
end to end, see [../specs/review-flow.md](../specs/review-flow.md).

## The rings in this package

| Ring | Where |
|---|---|
| 1 Domain | `modules/<m>/{types,ports,constants,helpers}.ts` + pure files (`pulls/status.ts`, `settings/feature-models.ts`), `modules/<m>/index.ts` (public API), `@devdigest/shared` (contracts + port interfaces), pure `platform/` files |
| 2 Application | `modules/<m>/service.ts` + use-case files (`reviews/run-executor.ts`, `reviews/diff-loader.ts`, `reviews/findings.ts`, `repo-intel/pipeline/*`) |
| 3 Infrastructure | `modules/<m>/repository.ts` / `repository/*.repo.ts`, `src/adapters/<name>/`, `src/db/`, `platform/{jobs,sse,config,prompts}.ts` |
| 4 Presentation + composition | `modules/<m>/routes.ts`, `modules/<m>/compose.ts`, `modules/index.ts`, `app.ts`, `platform/container.ts` |

## Composition root: `app.ts` → `Container` → `compose.ts`

`buildApp()` (`src/app.ts`) builds a `Container` (`src/platform/container.ts`)
from config + a `Db` handle, attaches it as `app.container`, then registers
every feature module from the static registry (`src/modules/index.ts`).

```ts
export interface BuildAppOptions {
  config?: AppConfig;
  db?: Db;
  overrides?: ContainerOverrides;   // ← the test seam for every adapter
}
```

The container owns **shared infrastructure only**: config, db, the job queue,
the run event bus, every adapter, and the one cross-module facade
(`repoIntel`). It does **not** build module services. Each module's
`compose.ts` does that — it constructs the module's repository and hands its
service exactly the ports it needs:

```ts
// modules/repos/compose.ts
export function createRepoService(c: Container): RepoService {
  return new RepoService({ repos: createRepoStore(c), jobs: c.jobs, git: c.git, secrets: c.secrets });
}
```

A route plugin wires once, at registration, and its handlers only call the
service:

```ts
const ctx = requestContext(app.container.auth);
const service = createRepoService(app.container);
app.get('/repos', async (req) => service.list((await ctx(req)).workspaceId));
```

Services never import `Container`; they receive a `Deps` object of
interfaces. Lazily-built clients arrive as resolvers
(`GitHubClientResolver`, `LLMProviderResolver`) because they depend on a
secret that can change at runtime.

A test either goes through the whole app —
`buildApp({ db: testDb, overrides: { llm: { openai: mockProvider } } })` — or
constructs a service directly with in-memory fakes of its ports
(`test/repo-intel-resync.test.ts`, `test/agents-versions.it.test.ts`).
`server/src/adapters/mocks.ts` holds the mock adapters.

## Ports: where each interface lives

- **External systems and platform services** → `@devdigest/shared`'s
  `adapters.ts` (edit `src/vendor/shared/adapters.ts`; `reviewer-core`
  compiles against the same file). The client copy of the package carries no
  ports.
- **A module's persistence** → that module's `ports.ts` (`RepoStore`,
  `PullStore`, `AgentStore`, `ReviewStore`, `SettingsStore`,
  `RepoIntelStore`), implemented by its `repository.ts`.
- **What one module needs from another** → declared by the consumer
  (`reviews/ports.ts`'s `PrFilesRefresher`), satisfied in `compose.ts`
  (`PullService` is passed in).

| Port (`@devdigest/shared`) | Concrete implementation | Notes |
|---|---|---|
| `LLMProvider` | `adapters/llm/openai.ts`, `adapters/llm/anthropic.ts`; OpenRouter from `@devdigest/reviewer-core` | Resolved lazily by id, cached in `llmCache`; secrets are re-read only on cache miss |
| `GitHubClient` | `adapters/github/octokit.ts` | Async getter — constructing it needs an awaited secret read |
| `GitClient` | `adapters/git/simple-git.ts` | Sync getter, memoized |
| `CodeIndex` | `adapters/codeindex/ripgrep.ts` | Depends on `container.git` — adapters depend on each other through the container |
| `CodeParser` | `adapters/astgrep/index.ts` (`AstGrepCodeParser`) | ast-grep + the regex endpoint/cron extractors; repo-intel only |
| `SourceFiles` | `adapters/fs/local-source-files.ts` | Reads/walks a local clone; repo-intel only |
| `DepGraph`, `Tokenizer` | `adapters/depgraph/`, `adapters/tokenizer/` | repo-intel indexer only |
| `Embedder` | `adapters/embedder/openai.ts` | Throws `ConfigError` **before** constructing anything when `EMBEDDINGS_ENABLED=false` |
| `SecretsProvider` | `adapters/secrets/local.ts` | Backs every other adapter's key lookup |
| `AuthProvider` | `adapters/auth/local.ts` | Single-workspace, no-op auth for the course starter |
| `JobQueue` | `platform/jobs.ts` (`JobRunner`) | p-queue + the `jobs` table |
| `RunEventBus` | `platform/sse.ts` (`RunBus`) | In-memory run log; the SSE route drains it through `ReviewService.events` |
| `Logger` | Fastify's pino instance (`app.log`) | Passed into `compose.ts` by the route plugin |

The container getter pattern is consistent across all adapters:

```ts
get git(): GitClient {
  if (this.overrides.git) return this.overrides.git;   // 1. test override wins
  this._git ??= new SimpleGitClient(this.config.cloneDir); // 2. lazy construct
  return this._git;                                      // 3. memoize
}
```

Adding a new external dependency means: an interface in `adapters.ts`, one
concrete class under `src/adapters/<name>/`, one field + getter on
`Container`, one optional key on `ContainerOverrides`, and passing it into
the consuming service's `Deps` from that module's `compose.ts`.

## Modules meet through `index.ts`

Each module that others depend on exposes a public `index.ts` (types, ports,
constants — ring 1, no `Container`). Application code imports another module
only from there; composition code imports another module's `compose.ts`. A
repository may still **read** another module's tables for a read model — the
PR list's SCORE/FINDINGS/COST rollups are `PullRepository` queries over
`reviews`/`findings`/`agent_runs` (see [review-flow.md](../specs/review-flow.md)).

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
