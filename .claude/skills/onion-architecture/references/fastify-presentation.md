# Presentation with Fastify (ring 4)

A module's `routes.ts` is a Fastify plugin with two parts: a **wiring
section** that runs once at registration, and **handlers** that run per
request.

```ts
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  // ---- wiring (once) ----
  const ctx = requestContext(app.container.auth);
  const service = createRepoService(app.container);   // from ./compose.js
  service.registerCloneJobHandler();

  // ---- handlers (per request) ----
  app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
    const { workspaceId, userId } = await ctx(req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return repo;
  });
}
```

## A handler may

- resolve the tenancy context (`await ctx(req)`) — always first;
- call **one** service method;
- choose a status code, map `undefined` → `NotFoundError`;
- frame an SSE stream from an async iterator the service returns.

## A handler must not

- touch `app.container` (the wiring section does that once);
- import Drizzle, `db/*`, an adapter, or call a port directly;
- `Schema.parse(req.body)` — declare the Zod schema on the route instead.
  `fastify-type-provider-zod` validates before the handler runs and types
  `req.body`. For an optional body use `Schema.nullish()` — Fastify hands an
  empty body to the validator as `null`, not `undefined`;
- contain branching business logic ("if the agent is disabled then…") —
  that belongs in the service, where a job or a test can reach it.

## Errors

Services throw `AppError` subclasses from `platform/errors.ts`
(`NotFoundError`, `ValidationError`, …). The global error handler in
`app.ts` maps them to the `ApiErrorBody` envelope; routes don't catch and
re-shape errors.

## Plugins and encapsulation

Each module is an **encapsulated** plugin (no `fastify-plugin` wrapper): its
hooks, decorators and routes don't leak to siblings. Only cross-cutting
infrastructure that every module needs is decorated at the root in `app.ts`
(`app.decorate('container', container)`). Don't `decorateRequest` with a
reference type (object/array): it is shared across requests — initialise it
in an `onRequest` hook instead.

## Logging

Fastify's pino instance (`app.log`) satisfies the `Logger` port. Pass it into
`compose.ts` from the wiring section; services log through `deps.logger`, never
`console`. Per-request logs use `req.log`, which a handler may pass as an
argument to a service method that wants request-scoped logging.
