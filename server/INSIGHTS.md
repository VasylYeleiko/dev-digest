# server/INSIGHTS

Append-only log of gotchas, decisions, and "why is it done this way" notes for
this package. Newest entry on top within each section, dated. Entries are only
ever added — a superseded note is corrected by a new dated entry, never edited
in place. When a note here turns out to be load-bearing for every session,
promote its one-line summary into [`AGENTS.md`](AGENTS.md) instead of leaving it
buried.

Written by the `engineering-insights` skill. Format:
`### YYYY-MM-DD — short title` + one to three sentences citing `file.ts:42`.

## What Works

## What Doesn't Work

### 2026-09-25 — fixed the 2026-09-18 `indexer-pipeline.test.ts` Windows entry below — `writeFileAt` now uses `dirname(full)`

Took the fix the 2026-09-18 entry named: `test/indexer-pipeline.test.ts`'s
`writeFileAt` helper built the parent dir with `full.lastIndexOf('/')`, which
is `-1` on a Windows-joined path (`join()` uses `\`) — swap to
`dirname(full)` (`node:path`) and all 11 tests pass on Windows, not just 5.
Needed because `pr-self-review`'s `checks.mjs` treats any hermetic test
failure as CRITICAL regardless of a documented "known baseline" — that
label doesn't exempt a `source: "check"` finding from blocking the gate.
Evidence: `server/test/indexer-pipeline.test.ts` (`writeFileAt`).

### 2026-09-24 — `POST /repos/:id/refresh` crashes the WHOLE API process (uncaught `GitError`) when the repo's remote doesn't exist

The seeded demo repo `acme/payments-api` has no real GitHub remote
(`https://github.com/acme/payments-api.git` 404s) — calling `/repos/:id/refresh`
on it throws an uncaught `GitError` from `simple-git`'s clone step that is never
caught anywhere in the request path, killing the entire Node process (not just
returning a 500 to that one request). Every route goes down until the process
is restarted. Don't call `refresh` on a seed/demo repo expecting a clean error;
a real fix wraps the clone in try/catch and surfaces a normal error response
instead of letting it escape to `uncaughtException`. Evidence: crash trace
citing `simple-git`'s `error-detection.plugin.ts`, triggered via
`server/src/modules/repos/routes.ts`'s `/repos/:id/refresh` handler.

### 2026-09-18 — `indexer-pipeline.test.ts` always fails 6/11 on Windows

Never assume your change broke it. `writeFileAt` builds its path with
`join(root, rel)` — backslashes on Windows — then looks for the parent via
`full.lastIndexOf('/')`, which returns `-1`, so the `mkdir` is skipped and
`writeFile` dies with `ENOENT … \src\a.ts`. The rest of the unit lane is green
(96 passed), so a red run with exactly these 6 is the known baseline. Confirm
any suspicion with `git stash push --include-untracked` + re-run, and restore
with `git stash pop`. The fix, when someone takes it, is `dirname(full)`
instead of the manual slash search. Evidence: `test/indexer-pipeline.test.ts:140-145`.

## Codebase Patterns

### 2026-09-23 — delete-then-insert on a table with no unique key needs a transaction AND `advisoryXactLock`

A transaction alone does not stop duplicates: two concurrent `replaceFiles(prId)`
both `DELETE` (neither sees the other's uncommitted inserts) and both `INSERT`,
because `pr_files`/`pr_commits` have no unique key. Serialize per key with
`advisoryXactLock(tx, \`pr_files:${prId}\`)` from `src/db/client.ts` as the first
statement. For read-decide-write on one row (agent version bump) use
`.for('update')` instead. `test/transactions.it.test.ts` fails when either lock
is removed — keep it that way. Evidence: `src/modules/pulls/repository.ts`
(`replaceFiles`), `src/modules/agents/repository.ts` (`update`).

### 2026-09-22 — a git network op must go through `SimpleGitClient.authed()`; never put the token in a URL

A token embedded in a clone URL (`https://x-access-token:<PAT>@github.com/…`)
is persisted by git in plain text in the clone's `.git/config`. Auth now comes
from the `GitTokenSource` the Container passes in (`secrets.get('GITHUB_TOKEN')`),
applied per operation as `-c http.https://github.com/.extraheader=AUTHORIZATION: basic …`.
Any new `fetch`/`clone`/`pull` in the adapter must use `await this.authed(dir)`
(plus `sanitizeRemote(dir)`), not `this.git(repo)` — otherwise it works on
public repos and fails with "Invalid username or token" on private ones.
Evidence: `src/adapters/git/simple-git.ts` (`authed`, `sanitizeRemote`),
`src/platform/container.ts` (`get git()`).

### 2026-09-20 — `SimpleGitClient.fetchPullHead()` existed, fully implemented, and had ZERO callers

A shallow clone (`CLONE_DEPTH=1`, `simple-git.ts`'s `clone()`) only ever
tracks the default branch, so an open PR's head commit is never locally
reachable — `git diff base...head` throws "unknown revision" for
essentially every real (non-merged) PR reviewed. `fetchPullHead()` exists
specifically to fix this (fetches GitHub's `pull/<n>/head`), is fully
implemented, and even has a mock in `adapters/mocks.ts` — but before this
session nothing called it anywhere in the codebase (confirmed by a
repo-wide grep). The symptom was silent and confusing: `loadDiff`'s
try/catch swallowed the throw and fell through to a DB-reconstructed diff
that was *also* usually empty, so every agent "reviewed" an empty diff and
correctly said "approve, nothing to review" — never an error, never a hint
what went wrong. Grep for zero callers on anything that "exists to solve
exactly this problem" before assuming the problem is unsolved. Evidence:
`src/modules/reviews/diff-loader.ts` (now calls it), `src/adapters/git/simple-git.ts:72-75`.

### 2026-09-18 — `@devdigest/shared` is TWO hand-mirrored copies, not a package

`AGENTS.md` lists `src/vendor/shared` under "Do not touch — edit the source
package instead". **That source package does not exist in this repo.** There are
only `server/src/vendor/shared/` and `client/src/vendor/shared/`, resolved by
tsconfig path alias and kept in sync by hand; adding a contract field means
editing both in lock-step or the client silently loses the field. Verify with
`diff server/src/vendor/shared/contracts/trace.ts client/src/vendor/shared/contracts/trace.ts`
— the only legitimate differences are comments.

## Tool & Library Notes

### 2026-09-23 — `buildApp()` flips every `running` agent run to `failed` on boot, so a test's seeded "running" run won't stay running

App boot calls `ReviewService.reapStaleRuns()` (orphaned runs from a dead
process), which updates EVERY `agent_runs` row with `status='running'` — not
just this process's. A test that inserts a running run and THEN builds the app
reads it back as `failed`; assertions like "the foreign cancel left it
`running`" fail for the wrong reason. Assert what the code under test must not
do (e.g. `not.toBe('cancelled')`) or build the app first. Evidence:
`test/sse-events.it.test.ts` ("another workspace's run…"), `src/modules/reviews/repository/run.repo.ts` (`reapStaleRunningRuns`).

### 2026-09-23 — `runBus` is a module-level singleton shared by every `buildApp()` in a test file

`platform/container.ts` assigns the exported `runBus` from `platform/sse.ts`, so
a "fresh" app does not get a fresh bus — runs published by an earlier test are
still known (`runBus.knows(id)`) until their 10-minute TTL eviction. A test
that needs a run the bus has never seen must create it DB-only (e.g.
`ReviewRepository.createAgentRun` + `completeAgentRun`), not through
`POST /pulls/:id/review`. Evidence: `test/sse-events.it.test.ts`,
`src/platform/sse.ts` (`COMPLETED_BUFFER_TTL_MS`).

### 2026-09-22 — an optional request body needs `Schema.nullish()`, not `.optional()`

Fastify passes an empty POST body to the zod validator as `null`, not
`undefined`. So `schema: { body: X.optional() }` rejects a bodiless request
with a 422 (`Expected object, received null`) before the handler ever runs.
Use `X.nullish()` and `req.body ?? {}` in the handler. Verified with
`app.inject` on `POST /pulls/:id/review`. Evidence: `src/modules/reviews/routes.ts`.

### 2026-09-20 — testing `container.ts`'s `buildLlm` DI wiring can't use the normal `overrides.llm` test pattern

`Container.llm(id)` checks `overrides.llm?.[id]` FIRST and returns it
immediately if set (`platform/container.ts`), which is exactly why every
existing integration test injects a `MockLLMProvider` that way — but it
also means those tests never execute `buildLlm` itself, so they can't catch
a regression in what `buildLlm` passes into a real provider's constructor.
To test `buildLlm`'s wiring, either `vi.mock` the concrete adapter modules
(`adapters/llm/openai.js`/`anthropic.js`) and construct a bare `Container`
directly, or accept you're only testing the mock's own behavior. If you do
construct a bare `Container` with a stub `SecretsProvider` that returns a
truthy value for any key, make `OPENROUTER_API_KEY` explicitly return
`undefined` — `container.priceBook`'s lazy refresh treats *any* truthy
OpenRouter key as "try a real network call" (wrapped in try/catch, so it
won't throw, but it will actually attempt one and make the test slow/flaky).
Evidence: `test/container-llm.test.ts`, `src/platform/container.ts:140-151`.

## Decisions

### 2026-09-26 — attaching a disabled skill to an agent is rejected server-side too, not just hidden in the UI

`SkillsTab` greys out a disabled skill and won't let it be freshly checked, but that's a client-only gate — a direct `POST /agents/:id/skills` call could still attach one. `AgentsService.setSkills`/`linkSkill` now compute which ids are *newly* attached (not already linked) and reject via `AgentStore.disabledSkillIds` (`ValidationError`, 422) if any of those are disabled. A skill that was already linked before being disabled is deliberately exempt — it stays attachable-to-detach/reorder, since kicking it out of the prompt-order list on every re-save of an unrelated reorder would be a surprising side effect. Evidence: `src/modules/agents/service.ts` (`rejectDisabled`), `src/modules/agents/repository.ts` (`disabledSkillIds`), `test/agents-skills.it.test.ts`.

### 2026-09-24 — Skill Stats are aggregated across every agent using a skill, not per-skill-attributed

`SkillsRepository.statsForSkill` has no way to isolate which of an agent's
findings came from one specific linked skill — a review prompt mixes the
system prompt + every enabled skill into one model call — so `accept_rate` /
`findings_30d` / `findings_by_category` are computed over ALL reviews/findings
of every agent that links the skill (join `agent_skills`→`agents`→`reviews`→
`findings`, workspace-scoped), not attributed to that skill alone. True
per-skill attribution needs the eval/CI module (not built yet); treat these
numbers as approximations and label them as such in any UI. Evidence:
`server/src/modules/skills/repository.ts` (`statsForSkill`).

### 2026-09-22 — `src/vendor/shared` is now edited in place (supersedes the 2026-09-18 "TWO hand-mirrored copies" note)

The false "do not touch, edit the source package" rule was removed from the
root, server and client `AGENTS.md`. The server copy is the source:
`reviewer-core` compiles against it, and every port interface lives in its
`adapters.ts`. The client copy mirrors `contracts/*` only; its unused
`adapters.ts` was deleted and `ModelInfo` moved to `contracts/platform.ts` in
both copies. The contract lock-step rule from the 2026-09-18 entry still
applies. Evidence: `server/AGENTS.md` (Non-default conventions), `client/src/vendor/shared/index.ts`.

### 2026-09-20 — `seed.ts`'s demo review is created with no `run_id`, inside the `if (!pr)` block, before the built-in agents exist

The sample review + findings (`seed.ts:137-176`) are inserted while creating
PR #482 for the first time, but linking them to an `agent_runs` row (so the
PR detail TIMELINE has a real run to render, not just a bare commit) needs an
`agentId` — and the built-in agents aren't seeded until *after* that block
(`seed.ts:179-222`). A run insertion has to happen in a separate pass after
the agents loop, re-querying the review by `prId` + `kind: 'review'` (the
local `review` binding from the PR-creation block is out of scope by then) and
guarding on `reviews.runId` being null so re-seeding stays idempotent per this
file's stated contract. Evidence: `src/db/seed.ts` (the "demo agent run"
block after the agents loop).

### 2026-09-19 — a regression test for removing a time-window heuristic must backdate a timestamp

Two runs triggered back-to-back in a testcontainers test (`waitForPrRuns`)
complete milliseconds apart — well inside any plausible time window — so a
naive "trigger twice, assert the sum" test passes identically on windowed and
non-windowed code and proves nothing. Confirmed by reverting `rollupCostByPr`
and re-running: the test only fails pre-fix once one run's `ran_at` is pushed
back an hour via a direct `update()`. Evidence: `test/reviews.it.test.ts`
("PR-list COST sums every successful run" test), `src/modules/pulls/status.ts`.

### 2026-09-18 — fields added to a jsonb-embedded contract must be optional

`RunStats` lives inside the `run_traces.trace` jsonb document, so rows written
before a field existed have no such key. New fields there get `.nullish()`, not
`.nullable()` — `.nullable()` still requires the key present and would reject
every historical trace on any future re-validation. Contracts rebuilt from a DB
row on each read (`RunSummary`) have no such constraint and stay `.nullable()`.
Evidence: `src/vendor/shared/contracts/trace.ts`, `src/platform/trace-builder.ts:56`.

## Recurring Errors & Fixes

### 2026-09-23 — `pnpm typecheck` is now green and covers tests (supersedes the "red on HEAD with exactly 2 errors" note)

The `migrate.ts` / `seed.ts` TS2345 errors are fixed (`process.argv[1] &&`
guard), and `typecheck` now runs `tsc -p tsconfig.test.json` (src **and**
`test/`) — the base `tsconfig.json` stays src-only because it drives `build`.
So any typecheck error is now yours; a test that stops matching the code it
exercises fails typecheck even though vitest (which strips types) passes.
Evidence: `server/tsconfig.test.json`, `package.json` (`typecheck`).

### 2026-09-22 — `pnpm typecheck` is red on HEAD with exactly 2 errors — known baseline, not your change

`src/db/migrate.ts:37` and `src/db/seed.ts:268` pass `process.argv[1]`
(`string | undefined` under `noUncheckedIndexedAccess`) to `pathToFileURL` —
TS2345 in both, introduced with the Windows entrypoint fix below. A typecheck
showing only these two is the baseline; the fix, when someone takes it, is
`pathToFileURL(process.argv[1] ?? '')`.

### 2026-09-22 — the whole `.it.test` lane silently SKIPS on Windows when files run in parallel

`dockerAvailable()` runs `docker info` with a 5 s timeout. When vitest starts
several `*.it.test.ts` files at once, the probes contend and time out, so
`describe.skip` kicks in and the run reports `1 passed | 5 skipped`, exit 0.
Nothing fails, so it looks green. Always run the lane with
`vitest run .it.test --no-file-parallelism`, and read the count: the baseline is
34 passed, 0 skipped. Evidence: `test/helpers/pg.ts:23-33`.

### 2026-09-19 — `db:migrate` and `db:seed` were silent no-ops on Windows

Both CLI entrypoints guarded on ``import.meta.url === `file://${process.argv[1]}` ``,
which never matches on Windows — `process.argv[1]` is `C:\…\migrate.ts` while
`import.meta.url` is `file:///C:/…/migrate.ts`. The body never ran, the script
exited **0**, and `scripts/dev.sh` reported success, so the API booted against an
empty database and failed with `relation "agent_runs" does not exist`. Always
check for the `✓ migrations applied` / `✓ seeded` line — exit 0 alone proves
nothing. Fixed with `pathToFileURL(process.argv[1]).href` at
`src/db/migrate.ts:37` and `src/db/seed.ts:228`; same class of bug as the
`indexer-pipeline.test.ts` entry above.

## Session Notes

### 2026-09-17 — CLAUDE.md/docs/specs/INSIGHTS scaffolding added

Seeded this file alongside `CLAUDE.md`, `docs/`, and `specs/` for the package.
No entries yet beyond what's already inlined as gotchas in `CLAUDE.md`
(migrate-on-boot, repo-map cache staleness, `INJECTION_GUARD`).

## Open Questions
