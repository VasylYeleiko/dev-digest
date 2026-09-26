# Application services (ring 2)

A service is a set of **use cases** for one module: each public method is one
thing a user or a job can ask the system to do (Stemmler: application
services / use cases). It loads what it needs through ports, applies domain
rules, persists through ports, and returns a wire contract or a domain type.

## Constructor injection with a `Deps` object

```ts
export interface RepoServiceDeps {
  repos: RepoStore;          // module persistence port (./ports.ts)
  jobs: JobQueue;            // platform port (@devdigest/shared)
  git: GitClient;            // adapter port (@devdigest/shared)
  secrets: SecretsProvider;  // adapter port (@devdigest/shared)
}

export class RepoService {
  constructor(private deps: RepoServiceDeps) {}
}
```

- List **interfaces**, never concrete classes. Narrow them with `Pick<>` when a
  service uses two methods of a wide port — it documents the real dependency
  and shrinks test fakes:
  `agents: Pick<AgentStore, 'getById' | 'listEnabled'>`.
- **Lazily-built clients** (GitHub, LLM) whose construction needs a secret are
  injected as **resolvers**: `github: GitHubClientResolver`,
  `llm: LLMProviderResolver`. A missing key surfaces as a `ConfigError` at call
  time, which the service can catch and degrade on.
- **Config** arrives as plain values (`enabled: boolean`, `cloneDir: string`,
  `indexConcurrency: number`) — the service never reads `process.env` or
  `AppConfig`.
- **Logging** arrives as the `Logger` port.
- Another application-ring collaborator (e.g. `ReviewRunExecutor`) may be a
  dep too; it is built in `compose.ts` like everything else.

No DI framework: TypeScript structural typing plus one `compose.ts` per module
gives the same inversion without decorators or reflection metadata.

## Why not pass the Container?

`new XService(container)` is the service-locator anti-pattern:

- the constructor no longer says what the service needs — you have to read
  every method to find out;
- the service can reach *anything* (the db handle, every adapter), so layering
  erodes one `this.container.db` at a time;
- tests must fake the whole container (`{ db } as unknown as Container`) or
  monkey-patch private fields.

## Shape of a method

```ts
async refresh(workspaceId: string, id: string): Promise<{ status: 'refreshing' }> {
  const repo = await this.deps.repos.getById(workspaceId, id);   // load via port
  if (!repo) throw new NotFoundError('Repo not found');          // domain error
  await this.deps.jobs.enqueue(workspaceId, CLONE_JOB_KIND, {…}); // side effect via port
  return { status: 'refreshing' };                               // contract
}
```

- Tenancy (`workspaceId`) is the first argument of every use case that reads
  workspace data.
- Throw `AppError` subclasses; never build an HTTP response.
- Pure steps (mapping, derivation, validation rules) are calls into the
  module's `helpers.ts` — keep them out of the method body if they deserve a
  unit test of their own.
- Best-effort enrichments (repo-intel context, GitHub sync) catch and log;
  they never fail the use case.

## Cross-module behaviour

When a use case needs behaviour owned by another module, the **consumer**
declares the port it needs in its own `ports.ts` and `compose.ts` supplies the
other module's service:

```ts
// reviews/ports.ts
export interface PrFilesRefresher {
  refreshFiles(repo: RepoRef, pull: { id: string; number: number }): Promise<boolean>;
}
// reviews/compose.ts
prFiles: createPullService(c, logger),   // PullService satisfies it structurally
```

This keeps the dependency pointing at an interface the consumer controls and
avoids import cycles between modules.
