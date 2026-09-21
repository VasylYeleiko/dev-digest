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

## Naming conventions

- **`_components/<Name>/`** (PascalCase folder, underscore prefix opts the
  folder out of Next's route tree) — `<Name>.tsx`, plus siblings as needed:
  `styles.ts` (the `s` object), `constants.ts`, `helpers.ts`, `index.ts`
  (barrel re-export), `<Name>.test.tsx`. A component private to one parent
  lives as a sibling file inside the parent's folder instead of its own
  `_components/` subfolder (e.g. `FindingsPanel/SeverityBar.tsx`).
- **Data hooks** — one file per API resource under `src/lib/hooks/`
  (`reviews.ts`, `agents.ts`, …), each hook named `use<Noun>`
  (`usePulls`, `useFindingAction`).
- **i18n** — one message file per feature namespace at
  `messages/<locale>/<namespace>.json`, read via
  `useTranslations("<namespace>")`; keys are dot-nested by UI section
  (`panel.hideLowConfidence`, `verdict.prScore`). `en` is the only locale
  today.

## Gotchas

- `*.test.tsx` here only covers component/interaction behavior with `fetch`
  mocked — it proves nothing about the real API or DB. Full user journeys
  (client + API + seeded DB) are covered by [`../e2e`](../e2e/README.md)
  instead; don't try to grow this suite into an e2e replacement.

## Do not touch

- `src/vendor/ui`, `src/vendor/shared` — vendored copies, edit the source
  package instead.
- `pnpm-lock.yaml` — regenerate via `pnpm install`, never hand-edit.

## Read When

- Touching route structure, Server/Client Component boundaries, or the
  `_components/` convention → [docs/ui-architecture.md](docs/ui-architecture.md)
- Touching a route's data or its URL params →
  [specs/pages.md](specs/pages.md)
- Anything in this package → [INSIGHTS.md](INSIGHTS.md) first,
  [TESTING.md](../TESTING.md) before writing a test
