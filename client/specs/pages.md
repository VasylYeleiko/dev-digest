# Pages — routes and their data

What each route loads and how its URL state maps to it. For the general shape
(the Server/Client split, the `_components/` convention, the hooks rule), see
[../docs/ui-architecture.md](../docs/ui-architecture.md). Cross-package specs
for a page's underlying feature (e.g. the run-cost rollup the Pull Requests
list reads) live with the package that owns that data model —
[server/specs/](../../server/specs/) indexes those.

| Route | `page.tsx` | Hooks | URL state |
|---|---|---|---|
| `/` | `src/app/page.tsx` | `useRepos()` | — (redirects to the first repo's `/pulls`, or to `/onboarding` if there are none) |
| `/onboarding` | `src/app/onboarding/page.tsx` → `_components/AddRepoView` | repo-add mutation hooks inside `AddRepoView` | — |
| `/agents` | `src/app/agents/page.tsx` → `_components/AgentsListView` | `useAgents()` inside the view | — |
| `/agents/:id` | `src/app/agents/[id]/page.tsx` | `useAgents()`, `useAgent(id)`, `useUpdateAgent()` | `?tab=` (only `config` is valid today) |
| `/repos/:repoId/pulls` | `src/app/repos/[repoId]/pulls/page.tsx` | `usePulls(repoId)`, `useRefreshRepo()` | `?status=` (`needs_review` default), free-text filter and `sort` are component state, not URL |
| `/repos/:repoId/pulls/:number` | `src/app/repos/[repoId]/pulls/[number]/page.tsx` | `usePulls(repoId)` (to resolve `number` → PR id), `usePullDetail(prId)`, `usePrReviews(prId)`, `usePrActiveRuns(prId)`, `usePrRuns(prId)`, plus `useCancelRun()` / `useDeleteRun(prId)` mutations | `?tab=` (`overview` default; `findings` is the "Agent runs" tab — see below) |
| `/settings/:section` | `src/app/settings/[section]/page.tsx` → `_components/SettingsView` | delegated to `SettingsApiKeys` / `SettingsModels` per section | `:section` path param (`api-keys` default), not a query param |

## `/repos/:repoId/pulls` — the PR list

Columns are driven entirely by `constants.ts`'s `COLUMN_KEYS` + `GRID` (in that
order): pull request, author, size, score, **findings**, status, **cost**,
updated. `usePulls` returns `PrMeta[]` — see
[server/specs/review-flow.md](../../server/specs/review-flow.md) for how
`score`, `cost_usd`, `findings`, and `findings_preview` are computed, and
[server/specs/0001-run-cost.md](../../server/specs/0001-run-cost.md)
specifically for cost. Filtering (`status`), the free-text query, and sort
order are all applied client-side over the single `usePulls` result — there is
no server-side filter/sort endpoint.

## `/repos/:repoId/pulls/:number` — PR detail

Four tabs, chosen by `?tab=`: `overview`, `findings` (labeled "Agent runs" in
the UI — it holds both the Timeline and the Review runs accordion, see
[server/specs/review-flow.md](../../server/specs/review-flow.md)), `diff`, and
a trace drawer that opens over any tab (`RunTraceDrawer`, driven by its own
`runId` state, not a URL param). The `findings` tab additionally reacts to
`?tab=findings` plus an in-memory `{ runId, nonce }` jump target set when a
Timeline tile is clicked, so the matching `ReviewRunAccordion` opens and
scrolls into view — that hand-off is component state, never encoded in the
URL.

## What isn't here

Component-internal state (a toggled filter, an expanded accordion, a focused
finding index) isn't listed above — it lives entirely in `React.useState`
inside the owning `_components/` tree and resets on navigation. Only state
that survives a refresh (because it's in the URL) or that spans multiple
components (because it's a TanStack Query cache entry) is a "page data"
concern worth documenting here.
