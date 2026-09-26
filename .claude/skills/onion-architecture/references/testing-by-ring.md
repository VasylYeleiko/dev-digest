# Testing each ring at its own seam

Onion's payoff is that the core runs without infrastructure (Palermo, tenet
4). Test each ring where it is cheapest to test, and don't reach through a
ring to test the one behind it. Tests live in `server/test/`;
`*.test.ts` is hermetic, `*.it.test.ts` needs Docker (testcontainers).

| Ring | What to test | How | Example |
|---|---|---|---|
| 1 Domain | pure rules, mappers, derivations | plain unit test, no fakes | `pulls-status.test.ts` (`deriveReviewStatus`, `rollupCostByPr`) |
| 2 Application | use-case orchestration, degraded paths | construct the service with **in-memory fakes of its `Deps`** | `repo-intel-resync.test.ts`, `repo-intel-facade-degraded.test.ts` |
| 3 Repository | SQL, scoping, upserts, cascades | `*.it.test.ts` against real Postgres | `repo-intel-symbol-clamp.it.test.ts` |
| 3 Adapter | the translation to/from the SDK | unit test against the adapter with a stubbed SDK or a temp dir | `astgrep.test.ts`, `indexer-walk.test.ts` |
| 4 Route | status codes, validation, the wire shape | `buildApp({ db, overrides })` + `app.inject()` | `reviews.it.test.ts`, `routes-smoke.test.ts` |

## Faking a `Deps` object

```ts
const service = new RepoIntelService({
  store: { getRepoBasics: async () => basics, tryGetIndexState: async () => state } as unknown as RepoIntelStore,
  git: new MockGitClient({ head: 'sha-1' }),
  enabled: true,
  // ports this test never reaches:
  codeIndex: {} as never, jobs: {} as never, parser: {} as never, files: {} as never,
  depgraph: { buildEdges: async () => [] }, tokenizer: { count: (t) => t.length / 4 },
  indexConcurrency: 1,
});
```

- Stub only the methods the path under test reaches; `as never` the rest so a
  surprise call fails loudly.
- Never monkey-patch a private field of a service — if a test needs to swap
  something, it belongs in `Deps`.
- `Pick<>`-narrowed deps make fakes smaller: a service that declares
  `agents: Pick<AgentStore, 'getById'>` is faked with one function.

## Route tests

`buildApp({ config, db, overrides })` swaps adapters for the whole app through
`ContainerOverrides`. Services are then built by the real `compose.ts`, so a
route test also covers the wiring. Integration tests need Postgres; run them
with `--no-file-parallelism` on Windows (see `server/INSIGHTS.md`).
