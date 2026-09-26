# Rings and the dependency rule

## The rule

Palermo's original formulation (2008) has four tenets; everything else in
this skill is a consequence of them:

1. The application is built around an **independent domain model**.
2. **Inner layers define interfaces; outer layers implement them.**
3. **Direction of coupling is toward the center.**
4. All application core code can be compiled and run **separate from
   infrastructure**.

Onion is Ports & Adapters (Cockburn) with the inside given explicit
structure: instead of one "application core" hexagon, the core is split into a
domain ring and an application ring (Graça). Clean Architecture (Martin) is
the same dependency rule with different ring names.

Any outer ring may call **any** inner ring directly — a route may use a
domain helper without going through a service. What is forbidden is only the
reverse arrow.

## What "depends on" means in TypeScript

An import is a dependency, **including `import type`**. Type-only imports are
erased at runtime, but they still couple the inner file's compilation to the
outer file's shape — which is the thing the rule protects. So:

```ts
// modules/reviews/service.ts  (ring 2)
import type { AgentRow } from '../../db/rows.js';          // ✗ ring 3 type in ring 2
import type { AgentEntity } from '../agents/index.js';     // ✓ ring 1 type, other module's public API
```

The same goes for re-exports: a ring-1 `index.ts` that re-exports a service
class type would make every consumer of that index depend on ring 2.

## Classifying a file

Classify by **what the file does**, not by the folder it sits in:

| If the file… | Ring |
|---|---|
| declares entity shapes, port interfaces, constants, or pure functions of its arguments | 1 |
| orchestrates ports: load → decide → persist → publish | 2 |
| talks to Postgres, the filesystem, a child process, the network or a vendor SDK | 3 |
| knows HTTP (Fastify request/reply, status codes, SSE framing) or constructs concrete classes | 4 |

Pure in-process libraries (`zod`, `p-queue`, `graphology`, `node:path`,
`node:crypto` hashing) are not infrastructure — they don't change with the
deployment and don't need faking in a test. They may appear in rings 1–2.
`node:fs`, `node:os`, `node:child_process`, `node:net` are infrastructure.

## Smells that the rule is being bent

- An `import type` of a Drizzle table or `$inferSelect` outside a repository.
- `import type { Container }` anywhere except `compose.ts`, `app.ts`,
  `platform/`.
- A service method that does `if (process.env…)` or reads `config` directly —
  config is a ring-4 concern; inject the value.
- A pure helper that takes a row type from another module's repository.
- A "shared" file that both reads the DB and holds business rules (it is two
  files).
- Tests that monkey-patch a private field (`(svc as any).repo = …`) — the
  service is hiding a dependency that should be in its `Deps`.
