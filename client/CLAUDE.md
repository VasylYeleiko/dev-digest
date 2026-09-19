# client — `@devdigest/web`

Map for this package. The UI route map diagram lives in
[README.md](README.md) — don't duplicate it here.

## Stack

Next.js 15 (App Router) · React 19 · TanStack Query for all API data ·
`next-intl` (`messages/<locale>/*.json`) · `recharts` · `mermaid` ·
`react-markdown`. UI primitives vendored under `src/vendor/ui`
(`@devdigest/ui`); shared Zod contracts under `src/vendor/shared`
(`@devdigest/shared`).

## Commands

- `pnpm dev` (`:3000`) · `pnpm build` · `pnpm typecheck`
- `pnpm test` — vitest + jsdom, `fetch` mocked, no API/browser needed

## Where things are

`src/app/{agents,onboarding,repos,settings}` — route pages
(`src/app/**/page.tsx`). `src/lib/api.ts` — the fetch wrapper
(`NEXT_PUBLIC_API_BASE`, default `http://localhost:3001`). `src/lib/hooks/*`
— every data hook (one per API resource). `src/components/app-shell` —
cross-cutting chrome (nav, breadcrumbs, `g`-then-key shortcuts).

## Non-default conventions

- Pages are thin; feature logic sits in colocated `_components/<Name>/`
  folders, each with its own `*.test.tsx` next to the component it tests.
- All server data access goes through a `src/lib/hooks/*` TanStack Query
  hook — don't `fetch` directly from a component.

## Gotchas

- `*.test.tsx` here only covers component/interaction behavior with `fetch`
  mocked — it proves nothing about the real API or DB. Full user journeys
  (client + API + seeded DB) are covered by [`../e2e`](../e2e/README.md)
  instead; don't try to grow this suite into an e2e replacement.

## Do not touch

- `src/vendor/ui`, `src/vendor/shared` — vendored copies, edit the source
  package instead.

## More

[docs/](docs/) · [specs/](specs/) ·
[INSIGHTS.md](INSIGHTS.md) — read before working in this package ·
[TESTING.md](../TESTING.md)
