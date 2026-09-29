---
name: deprecation-policy
description: Flag API removals that skip the deprecation window — mark it deprecated, keep it working, remove it only in a later major.
type: convention
---
# Deprecation policy

Nothing a client uses is removed in the same change that introduces its
replacement. Every removal of a route, param or response field goes through
three steps, each in its own release:

1. **Mark** — the old route/field keeps working and is marked deprecated where
   clients can see it: `.describe('Deprecated: use <replacement>')` on the zod
   contract, and `Deprecation` + `Sunset` response headers on a deprecated route.
2. **Keep** — it stays fully functional for at least one minor release, with its
   behavior unchanged. The replacement ships alongside it.
3. **Remove** — only in a later MAJOR release, with a migration note.

Report:

- **CRITICAL** — a route, param or response field removed without having been
  marked deprecated in an earlier release (it is also a breaking change).
- **WARNING** — a deprecated route or field whose behavior silently changed while
  it is still supposed to be kept working.
- **SUGGESTION** — a deprecation that names no replacement, or no sunset date.

## Bad — replacement and removal in one change

```ts
// GET /skills/:id/stats deleted in this diff…
app.get('/skills/:id/usage', { schema: { params: IdParams } }, usageHandler);
```

## Good — replacement ships, the old route is marked and kept

```ts
app.get('/skills/:id/usage', { schema: { params: IdParams } }, usageHandler);

app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req, reply) => {
  reply.header('Deprecation', 'true').header('Sunset', 'Wed, 31 Dec 2026 23:59:59 GMT');
  return usageHandler(req, reply); // unchanged behavior until the next major
});
```
