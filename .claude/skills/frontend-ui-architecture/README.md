# frontend-ui-architecture

**Version:** 1.0.1 (2026-09-22) · **Scope:** Frontend · **Entry:** [SKILL.md](SKILL.md)

Agent skill for **UI architecture and code organization** in React and Next.js
App Router projects: where components, constants, helpers, types, business
logic and data hooks live; how to split components; folder structure and
import direction; the Server/Client boundary and providers.

It is generic (usable in any React/Next.js repo) and ships a mapping onto
dev-digest's `client/` package in
[references/dev-digest-client.md](references/dev-digest-client.md).

## What it covers — and what it doesn't

| Covered here | Covered elsewhere |
|---|---|
| Folder structure, colocation, promotion to shared | Hooks rules, purity, state, effects → `react-best-practices` |
| Component decomposition | Performance, memoization → `react-best-practices` |
| Constants / helpers / lib / types placement | Next.js file conventions, async APIs, caching, images, fonts, bundling → `next-best-practices` |
| Business logic and data-layer placement | Testing → `react-testing-library` |
| Next.js architecture: page shape, `'use client'` placement, providers, data approach | Security of Server Actions / DAL in depth → `security` |

## Layout

```
frontend-ui-architecture/
├── SKILL.md                              # workflow, core rules, review checklist
├── README.md                             # this file: decisions, sources, changelog
└── references/
    ├── folder-structure.md               # layouts by size, component folder, imports, barrels, naming
    ├── component-decomposition.md        # when/how to split, logic ladder, patterns
    ├── code-placement.md                 # constants, helpers vs lib, business logic, data layer, types
    ├── nextjs-architecture.md            # data approach, pages, boundary, providers, RSC path
    └── dev-digest-client.md              # the rules applied to client/, known exceptions
```

`SKILL.md` stays short and points to one reference per topic, so an agent
loads only what the task needs.

## Decisions taken

The sources disagree on several points. These are the positions the skill
takes, and why:

| Question | Decision | Reasoning / sources |
|---|---|---|
| Group by feature or by type? | By feature/route + colocation; shared folders only for proven reuse | Majority view: Next.js docs, bulletproof-react, Kent C. Dodds, Robin Wieruch. Josh Comeau's type-based layout fits small projects only. |
| Barrel files | One-line component `index.ts` allowed; aggregating barrels not | Against: TkDodo, bulletproof-react (cycles, dev-server load). For as public API: Comeau, FSD. Compromise matches current `client/`. |
| Light feature structure or full FSD? | Route colocation → `features/` when needed; FSD only at large scale | FSD's layers pay off with many teams; too heavy for a medium app. |
| "helpers" vs "utils" | `helpers.ts` = private, domain-aware; `lib/<name>.ts` = shared; no catch-all `utils.ts` | Comeau distinguishes helpers/utils; others don't. The skill fixes one vocabulary that matches `client/src/lib`. |
| Domain layer: classes or functions? | Pure functions (+ dependency injection via params, thin hook) | Kettmann and React docs; Fowler's classes are valid but heavier than this codebase needs. |
| Next.js: RSC by default or SPA? | SPA-style with a separate API is the norm; RSC rules are "if a route moves to the server" | Next.js docs support both ("External HTTP APIs", SPA guide). `client/` is 53/58 client components. |
| Where the data layer lives | Central `lib/hooks/<resource>` modules, one key factory per resource | Keeps `client/`'s existing convention; TkDodo/Next.js docs' "next to the feature" is noted as the alternative. |

## Sources

Status: ✅ read at the source during research · 🔎 seen in search results only.

### Official documentation

- ✅ [React — Thinking in React](https://react.dev/learn/thinking-in-react)
- ✅ [React — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- ✅ [React — Keeping Components Pure](https://react.dev/learn/keeping-components-pure)
- 🔎 [React — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- ✅ [Next.js — Project Structure and Organization](https://nextjs.org/docs/app/getting-started/project-structure)
- ✅ [Next.js — Data Security (Data Access Layer)](https://nextjs.org/docs/app/guides/data-security)
- ✅ [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- ✅ [Next.js — The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary)
- ✅ [Next.js — Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data)
- ✅ [Next.js — Server Actions and Mutations](https://nextjs.org/docs/app/guides/server-actions)
- 🔎 [Next.js — Mutating Data](https://nextjs.org/docs/app/getting-started/mutating-data)
- ✅ [Next.js — Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend)
- ✅ [Next.js — Client-side Data Fetching](https://nextjs.org/docs/app/guides/client-side-data-fetching)
- ✅ [Next.js — TanStack Query guide](https://nextjs.org/docs/app/guides/client-side-data-fetching/tanstack-query)
- ✅ [Next.js — Single-Page Applications](https://nextjs.org/docs/app/guides/single-page-applications)
- 🔎 [vercel-labs/next-spa-patterns](https://github.com/vercel-labs/next-spa-patterns)

### Reference architectures

- ✅ [bulletproof-react — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- 🔎 [bulletproof-react — repository](https://github.com/alan2207/bulletproof-react)
- ✅ [Feature-Sliced Design — Layers](https://feature-sliced.design/docs/reference/layers)
- ✅ [Feature-Sliced Design — Slices and Segments](https://feature-sliced.design/docs/reference/slices-segments)
- 🔎 [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview)
- ✅ [Feature-Sliced Design — Usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)

### Practitioner articles

- ✅ [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation)
- ✅ [Robin Wieruch — React Folder Structure](https://www.robinwieruch.de/react-folder-structure/)
- ✅ [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/)
- ✅ [Josh W. Comeau — Making Sense of React Server Components](https://www.joshwcomeau.com/react/server-components/)
- ✅ [Martin Fowler / Juntao Qiu — Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html)
- ✅ [Jonas Kettmann — Path to a Clean(er) React Architecture, Part 6: Business Logic Separation](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-6-business-logic-separation-221g)
- 🔎 [Kettmann — Part 1: Shared API Client](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-a-shared-api-client-2d4p) · [Part 7: Domain Logic](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-7-domain-logic-lg) · [Part 8: React Query](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-8-how-does-react-query-fit-into-the-picture-1b99)
- ✅ [TkDodo — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files)
- ✅ [TkDodo — Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys)
- 🔎 [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0)
- ✅ [Dan Abramov — The Two Reacts](https://overreacted.io/the-two-reacts/)
- ✅ [patterns.dev — React patterns](https://www.patterns.dev/react/) (index page)
- ✅ [Sandro Roth — How to structure your React projects](https://sandroroth.com/blog/project-structure/)
- ✅ [freeCodeCamp — Reusable Architecture for Large Next.js Applications](https://www.freecodecamp.org/news/reusable-architecture-for-large-nextjs-applications/)
- 🔎 [profy.dev — Popular React Folder Structures and Screaming Architecture](https://profy.dev/article/react-folder-structure) (site unreachable during research)
- 🔎 [profy.dev — Business Logic Separation](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection) (read via the dev.to mirror above)

### Style guides and enforcement

- ✅ [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- 🔎 [Airbnb React/JSX Style Guide](https://github.com/airbnb/javascript/tree/master/react)
- 🔎 [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) · [docs](https://www.jsboundaries.dev/docs/overview/)

## Maintaining

- Bump `metadata.version` in `SKILL.md` frontmatter and add a changelog line
  on every change: **major** = a rule reverses, **minor** = new rule or
  reference, **patch** = wording/fixes.
- If `client/`'s conventions change, update
  `references/dev-digest-client.md` — the package's `AGENTS.md` stays the
  source of truth.
- Keep `SKILL.md` under ~200 lines; new depth goes into a reference file.

## Changelog

- **1.0.1** — 2026-09-22 — `dev-digest-client.md`: only `src/vendor/ui` is
  do-not-touch; `src/vendor/shared` mirrors the server's contracts (source).
- **1.0.0** — 2026-09-22 — Initial version: workflow + promotion ladder,
  folder structure, component decomposition, code placement, Next.js
  architecture, dev-digest `client/` mapping.
