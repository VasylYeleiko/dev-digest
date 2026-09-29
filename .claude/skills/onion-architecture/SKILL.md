---
name: onion-architecture
description: "Onion Architecture for the dev-digest backend (Fastify 5 + Drizzle + Zod + external SDKs behind ports): which ring a file belongs to, what each ring may import, where entity types, port interfaces, repositories, services and routes live, how a service gets its dependencies (constructor deps, never the Container), how Drizzle rows stay inside repositories, and how modules talk to each other. Use this skill whenever you add or change anything under server/src — a new module, route, service method, repository query, adapter or port — when you move logic out of routes.ts, decide 'where should this go?' on the backend, wire something into platform/container.ts, or review a backend PR for layering. Not for Fastify API details (fastify-best-practices), Drizzle query syntax (drizzle-orm-patterns), Zod schema design (zod) or table design (postgresql-table-design)."
metadata:
  version: 1.0.0
  tags: onion-architecture, clean-architecture, ports-and-adapters, fastify, drizzle, dependency-injection, backend
---

# Onion Architecture (server)

How `server/src` is layered so that business rules never depend on the
database, the web framework or a vendor SDK. This skill decides **which ring
code belongs to and what it may import**. Library-level "how do I write this
query / route / schema" lives in the neighbouring skills (end of file).

The whole skill rests on one rule (Palermo, 2008):

> **All coupling points toward the center.** Code may depend on rings closer
> to the core, never on rings further out. The database is not the center —
> it is external.

Inner rings declare **interfaces** (ports) for what they need from the
outside; outer rings **implement** them; one composition root wires the
implementations in at startup. That is what lets a test swap Postgres, GitHub
or an LLM for a mock without touching a service.

## Before you start

1. Read `server/AGENTS.md` and `server/INSIGHTS.md`. The project's recorded
   decisions win over anything generic here.
2. Read [references/dev-digest-server.md](references/dev-digest-server.md) —
   it maps every rule below onto the concrete files of this repo.
3. Find the closest existing module (`modules/repos` is the smallest complete
   one) and mirror its shape before inventing a new one.

## The four rings

```
            ┌────────────────────────────────────────────┐
            │ 4 Presentation + Composition                │  routes.ts · compose.ts
            │   ┌────────────────────────────────────┐   │  app.ts · platform/container.ts
            │   │ 3 Infrastructure                    │   │  repository.ts · adapters/* · db/*
            │   │   ┌────────────────────────────┐   │   │  platform/{jobs,sse,config,prompts}
            │   │   │ 2 Application               │   │   │  service.ts · use-case files
            │   │   │   ┌────────────────────┐   │   │   │
            │   │   │   │ 1 Domain            │   │   │   │  types.ts · ports.ts · index.ts
            │   │   │   │   + shared kernel   │   │   │   │  constants · pure helpers · shared
            │   │   │   └────────────────────┘   │   │   │
            │   │   └────────────────────────────┘   │   │
            │   └────────────────────────────────────┘   │
            └────────────────────────────────────────────┘
                    every arrow points inward ──►
```

| Ring | Files (per module `modules/<m>/`) | May import | Must NOT import |
|---|---|---|---|
| **1 Domain** | `types.ts` (entities, camelCase), `ports.ts` (persistence ports), `constants.ts`, pure logic (`helpers.ts`, `status.ts`, …), `index.ts` (public API) | domain files of its own module, other modules' `index.ts`, the shared kernel | `fastify`, `drizzle-orm`, `db/*`, `adapters/*`, `node:fs`/`os`/`child_process`, any SDK, `Container` |
| **2 Application** | `service.ts` and use-case files it delegates to (`run-executor.ts`, `diff-loader.ts`, `pipeline/*`) | domain, ports, other modules' `index.ts`, shared kernel, pure in-process libraries (`p-queue`, `graphology`) | everything ring 1 must not, plus concrete `*Repository` / adapter classes |
| **3 Infrastructure** | `repository.ts`, `repository/*.repo.ts`, `src/adapters/<name>/*`, `src/db/*`, `platform/{jobs,sse,config,prompts}.ts` | inner rings, Drizzle, SDKs, Node I/O | presentation (`fastify`, `routes.ts`), `Container` |
| **4 Presentation / Composition** | `routes.ts`, `compose.ts`, `modules/index.ts`, `app.ts`, `platform/container.ts` | everything | — (the only ring that knows concrete classes) |

**Shared kernel** — importable from every ring because it is pure and has no
I/O: `@devdigest/shared` (contracts + port interfaces), the pure engine exports
of `@devdigest/reviewer-core`, and the pure `platform/` files listed in
[references/dev-digest-server.md](references/dev-digest-server.md).

## Workflow: "where does this code go?"

Ask in order; stop at the first yes.

1. **Does it parse an HTTP request, choose a status code or frame SSE?** →
   `routes.ts` (ring 4). Nothing else.
2. **Does it build a concrete object (repository, adapter, service)?** → the
   composition root: the module's `compose.ts` or `platform/container.ts`.
3. **Does it run SQL / touch a Drizzle table?** → the module's repository
   (ring 3), behind a method declared in the module's `ports.ts`.
4. **Does it call a vendor SDK, the filesystem, a child process or the
   network?** → an adapter in `src/adapters/<name>/` (ring 3), behind a port
   in `@devdigest/shared/adapters.ts`.
5. **Does it orchestrate steps — load, decide, persist, publish?** → a
   service method (ring 2).
6. **Is it a pure rule, calculation, mapping or constant?** → domain (ring 1):
   `helpers.ts` / a named file like `status.ts`, or `constants.ts`.
7. **Is it a type?** Entity shape → `types.ts`. Wire shape → the Zod contract
   in `@devdigest/shared`. Port → rule 5 below.

## Core rules

Each rule has a short *why*; the references carry the detail and examples.

### 1. Dependencies point inward — [references/rings-and-dependency-rule.md](references/rings-and-dependency-rule.md)
An inner ring never imports an outer one, not even with `import type`.
*Why:* a type import is still coupling — rename a Drizzle column and the
service stops compiling. A type-only exception is exactly the leak onion
architecture exists to prevent.

### 2. Routes are thin — [references/fastify-presentation.md](references/fastify-presentation.md)
A handler resolves the request context, calls **one** service method and
maps the result/`null` to a status code. Validation happens in the route's
Zod `schema` (never a hand-rolled `.parse` in the handler). No `db`, no
adapter, no port, no `app.container` inside a handler — the plugin body wires
`requestContext(app.container.auth)` and the service once via the module's
`compose.ts`. Even SSE goes through the service (it exposes an async iterator;
the route only frames events).
*Why:* transport is the most volatile ring; logic in it can't be reused from
a job, a CLI or a test without an HTTP round-trip.

### 3. Services receive explicit dependencies — [references/application-services.md](references/application-services.md)
`constructor(private deps: XServiceDeps)` where `XServiceDeps` lists **ports**
(interfaces) — never `new XService(container)`, never `import type { Container }`.
Lazily resolved clients (GitHub, LLM) are injected as resolver functions.
Config flags are injected as plain values.
*Why:* passing the Container is the service-locator anti-pattern — the
constructor stops telling you what the service needs, and every test has to
fake the whole world.

### 4. Drizzle stays inside repositories — [references/drizzle-persistence.md](references/drizzle-persistence.md)
Only `repository.ts` / `repository/*.repo.ts` (and `src/db/*`) import
`drizzle-orm` or `db/schema`. A repository `implements` a port from the
module's `ports.ts` and returns **domain types** from `types.ts` or a
`@devdigest/shared` contract — never `typeof table.$inferSelect`. Every query is
workspace-scoped.
*Why:* the row shape is a persistence detail; services that see rows break
on every migration and can't be tested without Postgres.

### 5. Every external dependency is a port — [references/ports-and-adapters.md](references/ports-and-adapters.md)
- Ports to **external systems and platform services** (LLM, GitHub, git,
  secrets, auth, job queue, run event bus, code parser, tokenizer, …) live in
  `@devdigest/shared/adapters.ts` (edit `server/src/vendor/shared/adapters.ts`).
- **Persistence ports** of a module — and ports it needs from another module —
  live in that module's `ports.ts`.
- A concrete adapter lives in `src/adapters/<name>/`, `implements` its port,
  and is the **only** place its SDK is imported.
- Never declare a port inside `src/adapters/` — the interface belongs to the
  consumer, not to the implementation.

### 6. Modules meet only through `index.ts` (and wire through `compose.ts`)
Application and domain code import another module only from
`modules/<other>/index.ts`, which exports **types, ports and constants
only** — no `Container`, no classes. Composition code (`compose.ts`,
`container.ts`, `app.ts`) imports another module's `compose.ts` to reuse its
factories. When one module needs *behaviour* from another, the consumer
declares a port in its own `ports.ts` (e.g. reviews' `PrFilesRefresher`) and
`compose.ts` passes the other module's service in.
*Why:* a module whose internals are imported elsewhere can no longer change
alone; putting factories in `index.ts` would drag the outer ring into every
type import.

### 7. Composition happens in exactly two places
Concrete classes are constructed only in `platform/container.ts` (shared
adapters, the job queue, the run event bus, the one cross-module facade) and
in each module's `compose.ts` (its own repository + service + use-case
collaborators). `app.ts` and `routes.ts` call `compose.ts` factories; they
never `new` a repository.

### 8. Test each ring at its own seam — [references/testing-by-ring.md](references/testing-by-ring.md)
Domain → plain unit tests. Service → unit tests with in-memory fakes of its
ports. Repository → `*.it.test.ts` against testcontainers Postgres. Route →
`app.inject()` through `buildApp({ overrides })`.

## Adding a module — templates in [templates/module/](templates/module/)

1. `types.ts` — entity interfaces (camelCase).
2. `ports.ts` — `XStore` persistence port (+ any port it needs from another module).
3. `repository.ts` — `class XRepository implements XStore` (Drizzle).
4. `helpers.ts` — pure entity → DTO mappers and rules.
5. `service.ts` — `class XService` with `XServiceDeps`.
6. `index.ts` — public types/ports/constants, only if another module needs them.
7. `compose.ts` — `createXStore(c)` / `createXService(c)`.
8. `routes.ts` — Fastify plugin; wires via `createXService(app.container)`.
9. Register the plugin in `modules/index.ts`.

## Review checklist

There is no linter enforcing these rings in dev-digest — review is the
enforcement. For every changed file under `server/src`:

- [ ] The file's ring is obvious from its name and location.
- [ ] No import points outward (check `import type` too).
- [ ] No `drizzle-orm` / `db/` import outside repositories and `src/db`.
- [ ] No SDK / `node:fs` / `child_process` import outside `src/adapters`.
- [ ] No `Container` import outside `platform/`, `app.ts` and `compose.ts`.
- [ ] Route handlers don't touch `app.container`, `db`, adapters or ports.
- [ ] Services take a `Deps` object of interfaces; no `new` of a repository or adapter inside.
- [ ] Repositories return domain types, not `$inferSelect` rows.
- [ ] Cross-module imports go through `<other>/index.ts` (app code) or `<other>/compose.ts` (wiring).
- [ ] `index.ts` exports only types, ports and constants.
- [ ] New ports are declared on the consumer side (rule 5), not in `src/adapters`.
- [ ] Workspace scoping is preserved on every new query.

## Neighbouring skills

- `fastify-best-practices` — plugins, hooks, schemas, error handling, SSE.
- `drizzle-orm-patterns` — query syntax, relations, transactions, migrations.
- `zod` — contract/schema design, parsing, error handling.
- `postgresql-table-design` — columns, indexes, constraints.
- `security` — auth, input handling, secrets.

Sources and the reasoning behind contested choices: [references/sources.md](references/sources.md).
