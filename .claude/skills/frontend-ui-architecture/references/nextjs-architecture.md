# Next.js App Router architecture

Read when creating a page/layout, placing `'use client'`, adding a provider,
or when a route starts using server data or mutations. API details
(file conventions, async `params`, directives syntax, caching) are in
`next-best-practices`; this file is only about *structure*.

## Contents

1. Choose the data approach once
2. Pages and layouts
3. The Server/Client boundary
4. Providers
5. Client-side data with TanStack Query
6. If a route moves to the server

---

## 1. Choose the data approach once

Next.js documents three approaches and recommends **not mixing them**:

| Approach | Fits |
|---|---|
| **External HTTP APIs** | A separate backend already exists (e.g. a Fastify API). Frontend calls it over HTTP, from the browser or from server components. |
| Data Access Layer | New full-stack Next.js project; data access in `server-only` modules. |
| Component-level access | Prototypes only. |

A client-heavy, SPA-style app on the App Router with a separate API is a
supported architecture (Next.js "Single-Page Applications" guide): you still
get routing, code-splitting and the option to move individual routes to the
server later. Treat it as the norm when that's the project's shape — not as
tech debt to fix opportunistically.

## 2. Pages and layouts

- **`page.tsx` is thin**: read route params, render one view. Feature logic
  and markup live in the route's `_components/`.
- Two page shapes are both fine; mirror the nearest neighbour:
  1. *Server wrapper* — `page.tsx` has no directive and renders one client
     view.
  2. *Client page* — `page.tsx` has `'use client'` because it needs
     `useParams` / `useSearchParams` / data hooks directly.
- **Route groups** `(name)` organize routes or share a layout without changing
  URLs. **Private folders** `_name` hold non-routable code.
- Layouts own what persists across child routes (shell, providers). Don't put
  page-specific data or state in a layout.

## 3. The Server/Client boundary

- `'use client'` marks the **entry** of a client subtree. Everything that file
  imports joins the client bundle, so the directive is needed once per
  subtree — not on every file.
- Place it **as low as is practical**: on the interactive piece, not on the
  whole page/layout, *when the rest could be a server component*. In an
  SPA-style app where the whole page is interactive, a client page is fine.
- What crosses the boundary: **code crosses via imports; data crosses via
  props**, and props must be serializable (no functions except Server
  Actions).
- **Interleaving**: pass server-rendered output into a client component via
  `children` or slot props (`<Modal><Cart /></Modal>`). The client component
  places the output without importing its code.
- **Compound components break across the boundary** — `Menu.Item` imported
  into a server component is `undefined`. Export parts as named exports if a
  server component needs them.
- Wrap a third-party component that uses client features in your own tiny
  `'use client'` wrapper instead of marking your page client.
- Mark modules with `import 'server-only'` / `'client-only'` when importing
  them into the wrong environment would leak secrets or crash.

## 4. Providers

- A provider is a small `'use client'` component that renders
  `<Context.Provider>{children}</Context.Provider>`; import it from a (server)
  layout.
- Wrap only `{children}`, as deep as the consumers allow — not the whole
  `<html>` when only one section needs it.
- Keep all app-wide providers together in one `providers.tsx`; a provider only
  one route needs goes in that route's layout.

## 5. Client-side data with TanStack Query

- One `QueryClient` per browser session, created in the providers file (a new
  one per server render if you ever prefetch on the server).
- Data hooks live in the data layer (see code-placement.md); components call
  hooks.
- If a route later prefetches on the server, keep the query key + options in
  one **cache contract** module per resource (`xCache.key`, `xCache.options`,
  optionally `xCache.tag`) that imports nothing server- or client-only, so
  both sides share the same identity.

## 6. If a route moves to the server

Only relevant once a route uses server components for data or Server Actions.

- **Fetch where the data is used.** `fetch` is memoized per request and
  non-`fetch` reads can be wrapped in `React.cache`, so fetching in the
  consuming component beats drilling props from the page.
- **Stream to the client** by passing an un-awaited Promise as a prop and
  unwrapping it with `use()` inside `<Suspense>`.
- **Data access in `server-only` modules** that check authorization and return
  minimal DTOs — never pass raw records to client components.
- **Server Actions** live in an `actions.ts` (`'use server'`) next to the
  route. Treat each as a public POST endpoint: authenticate, authorize and
  validate inside it; keep it thin by delegating to the data module; return
  only what the UI renders. They run sequentially from the client, so don't
  use them to *read* data.
- **Route Handlers** (`route.ts`) are public HTTP endpoints for webhooks,
  callbacks, non-HTML responses or proxying. A server component must not fetch
  its own Route Handler — call the data function directly.
