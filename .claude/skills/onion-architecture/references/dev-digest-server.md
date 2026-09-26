# dev-digest `server/` — the rules mapped onto this repo

Everything below describes the code as it is; there are no grandfathered
exceptions. If you find code that contradicts this page, the code is the bug.

## Module layout

Every folder under `server/src/modules/` follows the same file roles
(`modules/repos/` is the smallest complete example):

| File | Ring | Role |
|---|---|---|
| `types.ts` | 1 | camelCase entities (`RepoEntity`, `PullEntity`, `AgentEntity`, `ReviewEntity`, …) and value types |
| `ports.ts` | 1 | `XStore` persistence port + ports the module needs from others |
| `constants.ts` | 1 | literals (job kinds, limits, secret names) |
| `helpers.ts`, `status.ts`, `feature-models.ts`, `findings.ts`… | 1 (pure) / 2 (if it calls a port) | entity → DTO mappers, derivations, rules |
| `index.ts` | 1 | public API for other modules: `export type` of entities/ports + constants. Absent when nothing imports the module (`polling`, `workspace`) |
| `service.ts` + use-case files | 2 | `class XService { constructor(private deps: XServiceDeps) }` |
| `repository.ts`, `repository/*.repo.ts` | 3 | `class XRepository implements XStore` — the only Drizzle code |
| `compose.ts` | 4 | `createXStore(c)`, `createXService(c[, logger])` |
| `routes.ts` | 4 | Fastify plugin: wiring once, thin handlers |

| Module | Service deps (ports) | Talks to |
|---|---|---|
| `repos` | `RepoStore`, `JobQueue`, `GitClient`, `SecretsProvider` | enqueues repo-intel jobs (constants from `repo-intel/index.ts`) |
| `workspace` | `Pick<RepoStore,'list'>`, `cloneDir` | repos store |
| `settings` | `SettingsStore`, `SecretsProvider`, GitHub + LLM resolvers, `invalidateSecretCaches` | — |
| `pulls` | `PullStore`, `Pick<RepoStore,'getById'>`, `GitHubClientResolver`, `Logger` | repos store |
| `polling` | repos + pulls stores (picked), `GitHubClientResolver` | repos, pulls |
| `agents` | `AgentStore`, `LLMProviderResolver` | — |
| `reviews` | `ReviewStore`, agents/pulls/repos stores (picked), `RunEventBus`, `ReviewRunExecutor` (→ `GitClient`, `PrFilesRefresher`, `LLMProviderResolver`, `RepoIntel`) | agents, pulls, repos, repo-intel |
| `repo-intel` | `RepoIntelStore`, `GitClient`, `CodeIndex`, `JobQueue`, `CodeParser`, `SourceFiles`, `DepGraph`, `Tokenizer`, `enabled`, `indexConcurrency` | exposed to others as the `RepoIntel` facade (`container.repoIntel`) |
| `_shared` | — | `context.ts` (`requestContext(auth)`), `schemas.ts` (`IdParams`) — presentation helpers only |

## `src/` outside modules

| Path | Ring | Notes |
|---|---|---|
| `src/vendor/shared/contracts/*` | 1 | Zod wire contracts (snake_case). Mirror every change into `client/src/vendor/shared/contracts/` |
| `src/vendor/shared/adapters.ts` | 1 | **all** shared port interfaces. Server + reviewer-core only |
| `@devdigest/reviewer-core` | 1 | pure review engine (`reviewPullRequest`, `countBlockers`, grounding). `OpenRouterProvider` from it is an adapter: only `container.ts` constructs it |
| `platform/errors.ts`, `resilience.ts`, `diff-parser.ts`, `trace-builder.ts`, `run-logger.ts`, `price-book.ts`, `model-router.ts`, `grounding.ts`, `prompt.ts`, `structured.ts` | 1 (shared kernel) | pure; importable from any ring |
| `platform/config.ts` | 3 | reads `process.env` — only the composition root reads `AppConfig` |
| `platform/jobs.ts` (`JobRunner`) | 3 | implements `JobQueue` (p-queue + `jobs` table) |
| `platform/sse.ts` (`RunBus`) | 3 | implements `RunEventBus` |
| `platform/prompts.ts` | 3 | reads prompt templates from disk |
| `platform/container.ts` | 4 | shared-infrastructure composition root + `ContainerOverrides` test seam |
| `src/adapters/<name>/` | 3 | one class per port; SDKs imported only here (`adapters/fs` for the filesystem) |
| `src/adapters/mocks.ts` | test support | mock adapters for `ContainerOverrides` |
| `src/db/*` | 3 | Drizzle schema, client, migrate, seed |
| `app.ts` | 4 | builds the Container, registers modules, error handler, health checks |
| `modules/index.ts` | 4 | static plugin registry |

## Quick grep audit

There is no dependency-cruiser config (typecheck + test is the check lane),
so these greps are the review tool. Each should print nothing:

```bash
cd server/src
# Drizzle / db outside repositories, db/, infra and the composition root
grep -rln "from 'drizzle-orm\|/db/schema\|/db/client" --include=*.ts . \
  | grep -v "^./db/\|repository\.ts$\|\.repo\.ts$\|^./platform/\(jobs\|container\)\.ts\|^./adapters/auth/\|^./app\.ts"
# Container outside composition
grep -rln "platform/container" --include=*.ts . | grep -v "compose\.ts$\|^./app\.ts\|^./platform/"
# Adapters or Node I/O reached from module code other than compose.ts
grep -rn "adapters/\|from 'node:\(fs\|os\|child_process\|net\)" --include=*.ts modules | grep -v "compose\.ts"
# Another module's internals (only index.ts / compose.ts are public)
grep -rnE "from '\.\./(agents|pulls|polling|repo-intel|repos|reviews|settings|workspace)/[^']*'" --include=*.ts modules \
  | grep -vE "/(index|compose)\.js'"
# Fastify outside routes / request-context helper / registry
grep -rln "from 'fastify" --include=*.ts modules | grep -v "routes\.ts$\|_shared/context\.ts$\|^modules/index\.ts$"
```

`import type` counts — the greps deliberately don't exclude it.
