# UI architecture

How this package is put together: the Server/Client Component boundary, the
`_components/` convention, and the one path data is allowed to take from the
API into a component. For route-by-route detail (what each page loads), see
[../specs/pages.md](../specs/pages.md).

## The Server/Client boundary is decided per page, not globally

Next's App Router defaults every component to a Server Component; `"use
client"` opts a subtree into the client bundle. This package does **not**
apply that boundary uniformly — it's decided file by file, and the two
resulting shapes coexist:

1. **Thin server wrapper** — `page.tsx` has no directive and renders exactly
   one client view from `_components/`:

   ```tsx
   // src/app/agents/page.tsx — a genuine Server Component
   import { AgentsListView } from "./_components/AgentsListView";
   export default function AgentsPage() {
     return <AgentsListView />;
   }
   ```

   `agents/page.tsx` and `settings/[section]/page.tsx` use this shape.

2. **Client page** — `page.tsx` itself has `"use client"` and calls
   `useParams`/`useSearchParams`/a data hook directly, with no server
   indirection layer.

   `src/app/repos/[repoId]/pulls/page.tsx`,
   `.../pulls/[number]/page.tsx`, `src/app/onboarding/page.tsx`,
   `src/app/agents/[id]/page.tsx`, and the root `src/app/page.tsx` all use
   this shape — five of the seven pages in the app.

**There is no rule that picks between them** — it tracks whether the route
needed a `_components/<View>` split for other reasons (size, a create-modal,
multiple tabs). Don't assume a new page must be either shape; match whichever
neighboring route it's most similar to, and default to the client-page shape
(2) for anything that needs `useSearchParams`-driven tab/filter state, since
that's the more common case here.

The one place the boundary is load-bearing is `src/app/layout.tsx`: it's an
`async` Server Component that reads the locale and messages
(`next-intl/server`'s `getLocale`/`getMessages`) before handing them to a
client `NextIntlClientProvider`. Every page, whichever shape it picks, renders
inside that provider — `useTranslations` never needs its own fetch.

## The `_components/` convention

Feature logic never lives in `page.tsx` itself. It lives in a colocated
`_components/<Name>/` folder (the `_` prefix opts the folder out of Next's
route tree, so `_components/FindingCard/` is not itself a route). See
[../CLAUDE.md](../CLAUDE.md)'s Naming conventions for the file layout inside
one of these folders (`<Name>.tsx`, `styles.ts`, `constants.ts`, `helpers.ts`,
`index.ts`, `<Name>.test.tsx`).

Two consequences that follow from this split:

- **A `_components/` tree can nest.** `pulls/[number]/_components/` holds
  page-level sections (`FindingsTab`, `OverviewTab`, `DiffTab`, …), and one of
  those, `RunTraceDrawer/`, has its own nested `_components/` for the drawer's
  internal sections (`TraceBody`, `FindingsSection`, `PromptBlock`, …). Nesting
  depth tracks composition depth, not route depth.
- **A component private to exactly one parent is a sibling file, not a
  subfolder.** `FindingsPanel/SeverityBar.tsx` lives next to
  `FindingsPanel.tsx`'s own `constants.ts`/`helpers.ts`/`styles.ts` because
  nothing outside `FindingsPanel` renders it — giving it its own
  `_components/SeverityBar/` folder would imply a reuse boundary that doesn't
  exist.

## Every server read goes through a `lib/hooks/*` TanStack Query hook

`src/lib/api.ts`'s `apiFetch<T>` is the only place a `fetch` call to the API
(`NEXT_PUBLIC_API_BASE`, default `http://localhost:3001`) is allowed to
originate; every hook in `src/lib/hooks/*` builds on it and normalizes
failures to `ApiError` (status 0 = network-down, distinct from a real HTTP
status) so the error UI can branch consistently. `src/lib/providers.tsx`
wires one `QueryClient` per browser session — mutations always toast on
error, queries only toast on network failure or 5xx (an expected 404 stays
silent for an inline empty state instead).

A component never calls `apiFetch` or `fetch` directly. If the data a new
component needs isn't covered by an existing hook, add one to
`src/lib/hooks/<resource>.ts` rather than reaching around it — this is what
keeps `client/*.test.tsx` able to mock one hook and get a deterministic
component test (see `client/CLAUDE.md`'s Gotchas on what that test tier does
and doesn't prove).
