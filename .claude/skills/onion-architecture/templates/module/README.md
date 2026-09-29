# Module template — `widgets`

Copy into `server/src/modules/<name>/`, rename `Widget`/`widgets`, delete what
the module doesn't need (no other module imports it → no `index.ts`). The
Drizzle table `t.widgets` is illustrative.

| File | Ring |
|---|---|
| `types.ts` | 1 — entities |
| `ports.ts` | 1 — persistence port |
| `helpers.ts` | 1 — pure mappers |
| `index.ts` | 1 — public API |
| `service.ts` | 2 — use cases |
| `repository.ts` | 3 — Drizzle |
| `compose.ts` | 4 — wiring |
| `routes.ts` | 4 — HTTP |

Then add the plugin to `server/src/modules/index.ts`.
