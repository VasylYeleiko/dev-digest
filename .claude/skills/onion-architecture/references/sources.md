# Sources and rationale

Every source below was opened and read when this skill was written
(2026-09-22); the note says what the skill takes from it.

## Onion / hexagonal / clean architecture

- Jeffrey Palermo — [The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/).
  The origin: the domain model at the center, "the database is not the
  center — it is external", all coupling toward the center, interfaces in the
  inner rings. → the dependency rule, rule 1, "Drizzle stays inside repositories".
- Jeffrey Palermo — [The Onion Architecture, part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/).
  Interfaces live in the core, dependencies are resolved at startup, the core
  compiles and runs without infrastructure, tests sit on the outside.
  → `compose.ts` / Container as composition roots, testing-by-ring.
- Herberto Graça — [Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/).
  Onion = Ports & Adapters with explicit inner structure; any outer layer may
  call any inner layer. → four rings, "an outer ring may skip rings".
- Alistair Cockburn — [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/).
  Ports belong to the application; adapters for DB/UI/tests plug in;
  primary (driving) vs secondary (driven) ports. → ports-and-adapters.md.
- Khalil Stemmler — [Organizing App Logic with the Clean Architecture](https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/).
  Six kinds of logic (presentation, data access, application, domain service,
  validation, entity) and the layer each belongs to. → the "where does this
  code go?" workflow.
- Khalil Stemmler — [Better Software Design with Application Layer Use Cases](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/application-layer-use-cases/).
  Use cases depend on repositories/services through interfaces passed to the
  constructor. → rule 3, application-services.md.
- Khalil Stemmler — [Clean Node.js Architecture](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/).
  "Something declared in an outer circle must not be mentioned in the code by
  an inner circle"; ports & adapters in Node/TS. → rule 1 including `import type`.

## Tools used by this backend

- Fastify — [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/).
  Child plugin contexts inherit from parents, never the reverse;
  `fastify-plugin` deliberately breaks encapsulation. → modules as
  encapsulated plugins; only cross-cutting decorations at the root.
- Fastify — [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/).
  Decorate synchronously; `decorateRequest` must not hold reference types.
  → fastify-presentation.md.
- Drizzle — [Transactions](https://orm.drizzle.team/docs/transactions).
  `db.transaction(async (tx) => …)`, `tx` has the full query API, nested
  savepoints, `tx.rollback()`. → the `UnitOfWork` port sketch.
- Sentry — [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/).
  Repositories accept an optional transaction and fall back to the plain
  driver; transactions are started above the repositories and passed down.
  → drizzle-persistence.md (transactions through a port, repositories take the
  db/tx handle in their constructor).
- borjatur — [clean-architecture-fastify-mongodb](https://github.com/borjatur/clean-architecture-fastify-mongodb).
  A Fastify + TypeScript template: core (entities, repository contracts,
  services) vs infrastructure (http routes/controllers, database,
  repository implementations). → confirms the ring split for Fastify.
- dependency-cruiser — [rules reference](https://github.com/sverweij/dependency-cruiser/blob/develop/doc/rules-reference.md).
  `forbidden` rules with `from`/`to` path regexes, `pathNot`, group matching,
  and a known-violations baseline. → the grep audit mirrors these rules; a
  real `.dependency-cruiser.cjs` is the natural next step (the package is
  already a dependency of `server/`).

## Prior art

- [humen-dev/dev-digest#5](https://github.com/humen-dev/dev-digest/pull/5) —
  another fork of this course repo with an onion-architecture skill and
  dependency-cruiser layer rules over a baseline of existing violations. Only
  the PR description was read, not its files.

## Contested choices

- **No DI framework (InversifyJS & co).** Constructor `Deps` objects +
  structural typing + one `compose.ts` per module give the same inversion
  without decorators or reflection, and keep `ContainerOverrides` as the only
  test seam.
- **`import type` counts as a dependency.** Some teams exempt type-only
  imports; this skill doesn't, because the leak it opens (services typed
  against Drizzle rows) is the most common way layering erodes.
- **Hand-written entity interfaces instead of `$inferSelect`.** Duplicates a
  few lines per table, but moves schema drift detection to the repository
  boundary.
- **Read models may join other modules' tables.** Strict module ownership
  would force the PR list to call three modules per row; a read-only join in
  `PullRepository` is simpler and writes still go through each owner's store.
