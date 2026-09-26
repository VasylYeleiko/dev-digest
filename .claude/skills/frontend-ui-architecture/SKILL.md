---
name: frontend-ui-architecture
description: "Frontend UI architecture and code organization for React and Next.js App Router apps: where components, constants, helpers/utils, types, business logic and data hooks live, how to split a component, folder structure, import direction, barrel files, and where the Server/Client boundary and providers go. Use this skill whenever you create a new component, page, route or feature folder, move or extract code out of a component, decide where a function/constant/type/hook should live, refactor a large component, scaffold a feature, or review a PR for code organization — even if the user only asks 'where should this go?' or 'clean this up'. Not for hook rules, rendering or performance (react-best-practices), Next.js APIs/caching (next-best-practices), or tests (react-testing-library)."
metadata:
  version: 1.0.1
  tags: react, nextjs, architecture, folder-structure, colocation, components
---

# Frontend UI architecture

How to organize React / Next.js App Router code so that the next person (or
agent) can find it, change it without side effects, and delete it cleanly.
This skill decides **where code goes and how it is split**. It deliberately
says nothing about hook rules, memoization, caching or bundle size — other
skills own those (see "Neighbouring skills" at the end).

The whole skill rests on one idea: **things that change together live
together** (Kent C. Dodds / Dan Abramov). Colocation keeps related code
visible, makes dead code obvious, and turns "delete a feature" into "delete a
folder". Shared folders are for code that has *proven* it is shared.

## Before you start

1. If the repo has package-level docs (`AGENTS.md`, `docs/ui-architecture.md`,
   `INSIGHTS.md`), read them first — **the project's existing convention wins
   over this skill** when they disagree. Consistency across a codebase is
   worth more than any individual rule here.
2. Working in dev-digest's `client/`? Read
   [references/dev-digest-client.md](references/dev-digest-client.md) — it maps
   every rule below onto the concrete folders and lists known exceptions.
3. Find the closest existing neighbour (a similar route, a similar component)
   and mirror its shape before inventing a new one.

## Workflow: "where does this code go?"

Answer two questions in order.

**1. What kind of code is it?**

| Kind | Home | Why |
|---|---|---|
| Markup + UI-only state (open/closed, hover, input value) | The component itself | UI state is an implementation detail of the view |
| Stateful logic with effects, subscriptions, browser APIs | A custom hook `useX` next to its consumer | Hides *how* behind *what*; the component reads as intent |
| Business / domain rule: calculation, mapping API → view model, formatting that encodes domain meaning, validation | A **pure TS function** (no React imports) in `helpers.ts` or a `lib/<domain>.ts` module | Unit-testable without rendering; reusable outside React; survives a UI rewrite |
| Server state: fetch, cache, mutate | The data-hook layer (one module per API resource) | One path for data means one place to mock, retry, and handle errors |
| Constant that never changes (labels map, limits, thresholds) | `constants.ts` next to its consumer, `CONSTANT_CASE` | Removes magic values from JSX without hiding them far away |
| Environment / runtime config | One config module; nothing else reads `process.env` | A single audited entry point for secrets and flags |
| Type used by one module | Same file | Types are part of the module's contract |
| Type shared across the wire | The shared contracts package | The contract is the naming boundary (snake_case ↔ camelCase) |

**2. Who uses it?** — the *promotion ladder*:

1. **One component** → inside that component's file or a sibling file in its
   folder (`helpers.ts`, `constants.ts`, `SubPart.tsx`).
2. **Several components of one route / feature** → the route's or feature's
   shared level (e.g. a `helpers.ts` beside the route's `_components/`, or
   `features/<x>/lib/`).
3. **Two or more features** → a shared top-level home (`components/`,
   `hooks/`, `lib/`).

Promote on the **second real consumer**, not in anticipation of one. Moving a
file up is a cheap, mechanical change; untangling a premature "shared" module
that three features now depend on is not. When a shared thing loses its last
consumer, delete it.

## Core rules

Each rule has a short *why*; details and examples live in the references.

### Structure — see [references/folder-structure.md](references/folder-structure.md)

- **Group by feature / route, not by file type.** A global `components/`
  folder holds only generic, reusable UI; everything else sits with the
  feature that owns it. Type-based trees (`components/`, `hooks/`, `utils/`
  holding everything) scatter one change across the whole repo.
- **Imports flow one way: shared → features → app.** Shared code never
  imports from a feature; a feature never reaches into another feature's (or
  another route's `_components/`) internals. If two features need the same
  thing, promote it. This is what makes a feature safe to change in isolation.
- **Keep nesting shallow** — about two levels of component folders below a
  feature. Deeper trees are hard to navigate; a deep child that grew up
  usually deserves promotion instead.
- **Barrel files: one-line component barrels only.** A component folder may
  have an `index.ts` that re-exports that one component. Do **not** create
  aggregating barrels (`features/x/index.ts`, `components/index.ts`,
  `lib/index.ts` re-exporting many modules): they cause circular imports and
  force the dev server to load every module behind them. Import from the
  concrete file instead.
- **Name files by what they do** (`cost.ts`, `github-urls.ts`), never a
  catch-all `utils.ts` that becomes a junk drawer.

### Components — see [references/component-decomposition.md](references/component-decomposition.md)

- **Split by responsibility, not by line count.** Split when a section has its
  own state, its own reason to change, is reused, or is hard to test in
  place. ~200 lines is a smell worth checking, not a rule.
- **A child used by exactly one parent is a sibling file** in the parent's
  folder, not its own folder — a folder implies a reuse boundary.
- **Logic out of JSX, in this order:** compute during render → pure function
  outside the component → custom hook (only if it actually calls hooks;
  otherwise no `use` prefix).
- **No container/presentational wrappers.** Custom hooks already separate
  logic from view without an extra component layer (Dan Abramov retracted the
  pattern for this reason).
- **Prefer composition (`children`, slot props) over boolean-prop
  explosions.** It keeps components small and — in Next.js — lets server
  output nest inside client components.
- One exported component per file; named exports.

### Code placement — see [references/code-placement.md](references/code-placement.md)

- **Business logic is plain TypeScript.** Components and hooks *call* domain
  functions; they don't *contain* them. A rule you can't unit-test without
  rendering is in the wrong place.
- **Helpers vs lib vs utils** — this skill's vocabulary:
  `helpers.ts` = domain-aware code private to one component/feature;
  `lib/<name>.ts` = project-wide modules (API client, domain helpers, config);
  generic domain-agnostic utilities (string, date, array) are rare — name them
  specifically and keep them in `lib/`.
- **Components never call `fetch` directly.** All server reads and writes go
  through the data-hook layer; each resource has one query-key factory and
  exports hooks, not raw keys or fetchers.
- **Map API DTOs to view models at the edge** (in the data layer or a mapper
  helper), so components don't depend on wire field names.

### Next.js App Router — see [references/nextjs-architecture.md](references/nextjs-architecture.md)

- **Client-heavy (SPA-style) apps with a separate backend are a legitimate
  architecture**, not a violation. Next.js documents it; use "External HTTP
  APIs" as the data approach.
- **`page.tsx` stays thin**: route params → one view component. Feature logic
  lives in colocated `_components/` (the `_` opts the folder out of routing).
- **Put `'use client'` at the entry of an interactive subtree**, not on every
  file and — when a page can be a server component — not on the page.
- **Providers are small client components wrapping only `{children}`**, placed
  in the nearest layout that needs them.
- **If a route moves to the server** (RSC data, Server Actions): data access
  goes in a `server-only` module, Server Actions live in `actions.ts` next to
  the route and stay thin, and server components never fetch their own Route
  Handlers. Details in the reference.

## Review checklist

Use when reviewing a diff for organization (there is no linter enforcing
these in dev-digest — review is the enforcement):

- [ ] New code sits at the lowest level of the promotion ladder that fits.
- [ ] No import from another feature's / route's private folder.
- [ ] No new aggregating barrel; component `index.ts` has a single re-export.
- [ ] No business rule inlined in JSX or a hook that could be a pure function.
- [ ] No `fetch` / API client call from a component.
- [ ] No magic numbers/strings in JSX that deserve a named constant.
- [ ] Functions without hooks are not named `useX`.
- [ ] `'use client'` is at a subtree entry, providers wrap only `children`.
- [ ] Nothing added to a shared folder with a single consumer.
- [ ] The change matches the nearest neighbour's shape.

## Neighbouring skills

- `react-best-practices` — purity, hooks rules, state, effects, performance.
- `next-best-practices` — file conventions, async APIs, directives, caching,
  metadata, images, fonts, bundling.
- `react-testing-library` — how to test the components you just placed.

Sources and the reasoning behind contested choices: [README.md](README.md).
