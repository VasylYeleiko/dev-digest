# Applied: dev-digest `client/`

How the generic rules map onto `client/` (Next.js 15 App Router, React 19,
TanStack Query, separate Fastify API on `:3001`). The package's own
[`client/AGENTS.md`](../../../../client/AGENTS.md) and
[`client/docs/ui-architecture.md`](../../../../client/docs/ui-architecture.md)
are authoritative; if they change, they win over this file.

Snapshot: 2026-09-22.

## Where things go

| Code | Location in `client/` |
|---|---|
| Route page | `src/app/**/page.tsx` — thin |
| Route-owned component | `src/app/<route>/_components/<Name>/` (PascalCase folder) |
| Private child of one component | Sibling file, e.g. `FindingsPanel/SeverityBar.tsx` |
| Nested sections of a big component | Nested `_components/`, e.g. `RunTraceDrawer/_components/` |
| Component used by 2+ routes | `src/components/<Name>/` (e.g. `FindingsPopover`, `RunCostBadge`) |
| Component files | `<Name>.tsx`, `styles.ts` (the `s` object), `constants.ts`, `helpers.ts`, `index.ts`, `<Name>.test.tsx` |
| Fetch wrapper | `src/lib/api.ts` (`apiFetch`) — the only place a request to the API originates |
| Data hooks | `src/lib/hooks/<resource>.ts`, one file per API resource, hooks named `use<Noun>` |
| Shared domain helpers | `src/lib/<name>.ts` (`cost.ts`, `github-urls.ts`, `model-label.ts`) |
| Providers | `src/lib/providers.tsx` (one `QueryClient` per browser session) |
| Shared types | `src/lib/types.ts`; wire contracts from `src/vendor/shared` |
| UI strings | `messages/<locale>/<namespace>.json` via `useTranslations` — not constants |

## Next.js model

`client/` is an SPA-style App Router app using the **External HTTP APIs**
approach: 53 of 58 non-test `.tsx` files are client components, there are no
Server Actions and no Route Handlers. The one load-bearing server piece is
`src/app/layout.tsx`, which loads i18n messages on the server and hands them
to a client provider.

Both page shapes exist (thin server wrapper vs client page); default to the
client-page shape for pages driven by `useSearchParams` tab/filter state —
that's what most routes do. Section 6 of nextjs-architecture.md
("If a route moves to the server") is future guidance, not a to-do.

## Known exceptions — don't "fix" unasked

- **`src/lib/hooks/index.ts` is an aggregating barrel** (re-exports `core`,
  `agents`, `reviews`, `trace`, `repo-intel`). It predates this skill. In new
  code prefer importing the concrete file (`@/lib/hooks/reviews`); don't add
  new re-exports; removing the barrel is a separate refactor.
- **`src/vendor/ui` is vendored** — never edit it to fit these rules; wrap or
  build locally instead (see `client/INSIGHTS.md` for the `Dropdown` case).
  `src/vendor/shared` is different: it mirrors `server/src/vendor/shared/contracts`
  (the source) — change a contract there first, then mirror it here in the same change.
- **No linter** — the review checklist in `SKILL.md` is the enforcement.

## Worked example: adding a "reviewer notes" section to the PR page

1. Only the PR detail route needs it → `src/app/repos/[repoId]/pulls/[number]/_components/ReviewerNotes/`.
2. Data: add `useReviewerNotes` (+ its key in the resource's key factory) to
   `src/lib/hooks/reviews.ts`; the component calls the hook, never `apiFetch`.
3. Formatting a note's age with domain rules → `helpers.ts` in the folder,
   unit-tested in `ReviewerNotes.test.tsx` or a sibling test.
4. The "max visible notes" number → `MAX_VISIBLE_NOTES` in `constants.ts`.
5. Labels → the feature's i18n namespace.
6. Later the PR list also shows notes → promote the folder to
   `src/components/ReviewerNotes/` and move `helpers.ts` with it.
