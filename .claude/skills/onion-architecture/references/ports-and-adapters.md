# Ports and adapters

A **port** is an interface owned by the code that *uses* it. An **adapter**
is the class that makes a concrete technology satisfy it (Cockburn). The
direction matters: the interface lives in the inner ring, so the inner ring
never learns which SDK sits behind it.

## Where a port lives

| Port kind | Home | Examples |
|---|---|---|
| External system / vendor SDK | `server/src/vendor/shared/adapters.ts` (`@devdigest/shared`) | `LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `CodeParser`, `SourceFiles`, `DepGraph`, `Tokenizer`, `Embedder`, `SecretsProvider`, `AuthProvider` |
| In-process platform service | same file | `JobQueue`, `RunEventBus`, `Logger`, the `*Resolver` function types |
| A module's persistence | `modules/<m>/ports.ts` | `RepoStore`, `PullStore`, `ReviewStore` |
| Behaviour one module needs from another | the **consumer's** `ports.ts` | `reviews`' `PrFilesRefresher` |

`adapters.ts` is compiled by `reviewer-core` too, so shared ports are visible
to the CI runner; the client copy of `@devdigest/shared` carries no ports.

**Never** declare a port inside `src/adapters/`. An interface next to its only
implementation is owned by the outer ring — every consumer then imports
infrastructure to get a type.

## Adapter rules

- One folder per technology: `src/adapters/<name>/`.
- The class `implements` its port; the SDK is imported **only** here.
- Adapters may do I/O (fs, network, child processes). Pure helpers used by
  both an adapter and application code (a diff parser, say) belong in the
  shared kernel (`platform/`), not in `adapters/`.
- An adapter that needs another adapter gets it through its constructor from
  the container (`new RipgrepCodeIndex(this.git)`), not by importing it.
- Adapters may import inward (e.g. a module's `constants.ts`).
- Every adapter has a mock or a trivially fakeable interface
  (`src/adapters/mocks.ts`).

## Adding an external dependency — checklist

1. Port interface in `server/src/vendor/shared/adapters.ts`.
2. `src/adapters/<name>/<impl>.ts` with `class X implements Port`.
3. Getter on `Container` (override → lazy construct → memoize) and an optional
   key on `ContainerOverrides`.
4. A mock in `src/adapters/mocks.ts` if tests need behaviour.
5. Pass it into the consuming service's `Deps` from that module's `compose.ts`.
6. Nothing else imports the adapter class.

## The Container

`platform/container.ts` is the composition root for **shared
infrastructure**: config, db, job queue, run event bus, adapters, and the one
cross-module facade (`repoIntel`). It never builds module services — each
module's `compose.ts` does. The `overrides` object is the single test seam:
`buildApp({ overrides: { llm: { openai: mock } } })` replaces an adapter for
every module at once.
