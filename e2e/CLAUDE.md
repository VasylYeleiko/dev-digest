# e2e — `@devdigest/e2e`

Map for this package. Full flow-spec format and coverage table live in
[README.md](README.md) — don't duplicate them here.

## Stack

[agent-browser](https://github.com/vercel-labs/agent-browser) (native
Rust + CDP CLI). **No Playwright, no LLM, no API key** — locators are
deterministic only (`--url`, `--text`, `find role|text|label`); the AI
`chat` command is never used.

## Commands

- `./scripts/e2e.sh` (**recommended**) — boots an isolated, freshly-seeded
  stack on alternate ports (Postgres `:5433`, API `:3101`, web `:3100`),
  runs the flows, tears everything down; safe alongside your normal dev stack
- `cd e2e && npm test` — against your **own** running stack
  (`./scripts/dev.sh`); only safe if that DB contains *only* the seeded repo

## Where things are

`specs/NN-name.flow.json` — one file per flow, a JSON list of agent-browser
commands run in order by `src/lib`'s runner. `{BASE}` in a spec resolves to
`E2E_BASE_URL`.

## Non-default conventions

- A flow's assertions **are** its `wait --text` / `wait --url` steps — they
  time out and exit non-zero if the condition never holds; there's no
  separate assertion API beyond the optional `"assert": { "stdoutIncludes" }`.

## Gotchas

- ⚠️ **Never `docker compose down -v`** to "reset" a dev DB — it deletes the
  `devdigest_pgdata` volume, wiping every real imported repo and review.
- Flows assume a **freshly-seeded, single-repo** DB (`acme/payments-api`,
  PR #482) — running against a dev DB with other imported repos makes flows
  `02`/`04`/`05` land on the wrong repo and fail. Use the hermetic runner.

## Do not touch

- Don't hand-edit `specs/*.flow.json` — author flows as command lists per
  the README's format, keeping locators deterministic (no AI `chat` steps).

## More

[specs/](specs/) ·
[INSIGHTS.md](INSIGHTS.md) — read before working in this package ·
[TESTING.md](../TESTING.md)
