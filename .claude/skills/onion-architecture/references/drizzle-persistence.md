# Persistence with Drizzle (ring 3)

Palermo's first ring around the domain holds the **repository interfaces**;
the implementations live outside, because they involve the database. In this
repo:

- the interface is the module's `ports.ts` → `XStore`;
- the implementation is `repository.ts` → `class XRepository implements XStore`;
- the only files that import `drizzle-orm`, `db/schema` or `db/client` are
  repositories (and `src/db/*` itself, plus the composition root).

## Return domain types, not rows

```ts
// ✗ leaks the persistence model
export type RepoRow = typeof t.repos.$inferSelect;
async getById(ws: string, id: string): Promise<RepoRow | undefined>

// ✓ returns the module's entity
async getById(ws: string, id: string): Promise<RepoEntity | undefined> {
  const [row] = await this.db.select().from(t.repos).where(…);
  return row;   // compiles only while the row is assignable to RepoEntity
}
```

Entities are hand-written camelCase interfaces in `types.ts`. When the table
row has exactly the entity's shape, the repository returns the row as-is and
TypeScript checks the assignment — a schema change that breaks the entity
fails **in the repository**, at the boundary, not in every service. When the
shapes differ (a jsonb column, a join, a narrower read model), select the
fields explicitly or map them in the repository.

A repository may also return a `@devdigest/shared` contract when the read is
purely for the wire (e.g. `RunSummary[]` for the run history).

## Rules

- **Every query is workspace-scoped** unless the method's name and docstring
  say otherwise (`workspaceIdFor(repoId)` for background jobs).
- **Translate database errors** into `AppError`s inside the repository
  (unique violation → a conflict error), so services never see a driver
  error code.
- **No query builders cross the boundary.** A repository method returns
  data, never a Drizzle builder or a `sql` fragment.
- **Read models may join other modules' tables** (the PR list reads
  `reviews`, `findings`, `agent_runs`). Writes to another module's aggregate
  go through that module's store.
- Split a large repository by aggregate into `repository/*.repo.ts` functions
  and keep one `XRepository` class that composes them and implements the port.

## Transactions

Keep the unit of work inside one repository method when you can
(`insert agent + snapshot version`). When a use case must span several store
calls atomically, add a port for it rather than leaking `db.transaction`:

```ts
// ports.ts
export interface UnitOfWork {
  run<T>(fn: (stores: { reviews: ReviewStore; pulls: PullStore }) => Promise<T>): Promise<T>;
}
// repository side
run(fn) { return this.db.transaction((tx) => fn({ reviews: new ReviewRepository(tx), pulls: new PullRepository(tx) })); }
```

Repositories take the `Db` in their constructor, so a transaction handle can
be passed in the same way (Drizzle's `tx` supports the full query API and
nested savepoints). The service still sees only ports.
