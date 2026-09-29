# Folder structure

Read when creating a new route, feature or shared module, or when deciding
whether something should be promoted to a shared folder.

## Contents

1. Pick a layout by project size
2. Reference layout (Next.js App Router)
3. Component folder anatomy
4. Import direction
5. Barrel files
6. Naming
7. Enforcement

---

## 1. Pick a layout by project size

Grow the structure only when the codebase asks for it (Robin Wieruch's
progression). Each step is a mechanical refactor of the previous one.

| Size | Layout |
|---|---|
| Prototype, a few screens | Flat `components/`, `hooks/`, `lib/` |
| Growing app, several routes | **Route colocation**: shared folders at the root + each route owns its `_components/` (Next.js "split by feature or route") |
| Many teams / domains, cross-route features | Add `features/<domain>/` for domain code used by several routes; routes compose features |
| Very large, strict boundaries needed | Feature-Sliced Design layers (`app → pages → widgets → features → entities → shared`) |

Don't jump to FSD for a medium app: its layer ceremony costs more than it
saves until several teams share one frontend.

## 2. Reference layout (Next.js App Router, route colocation)

```
src/
  app/                          # routing + route-owned UI
    layout.tsx                  # root providers
    repos/[repoId]/pulls/
      page.tsx                  # thin: params → one view
      _components/              # private to this route (not routable)
        PullsTable/
          PullsTable.tsx
          PullsTable.test.tsx
          RowActions.tsx        # private child → sibling file
          constants.ts
          helpers.ts
          styles.ts
          index.ts              # single re-export
  components/                   # generic UI reused by 2+ routes
    FindingsPopover/
  lib/                          # project-wide modules
    api.ts                      # the only fetch wrapper
    hooks/                      # data hooks, one file per API resource
    cost.ts                     # domain helper shared across routes
    providers.tsx
```

`features/<domain>/` (bulletproof-react style) sits next to `app/` when domain
code spans routes; its internal shape mirrors a component folder
(`components/`, `hooks/`, `lib/`, `api/`, `types.ts`) — include only the
subfolders it actually needs.

## 3. Component folder anatomy

A component folder is the unit of colocation. Everything only it uses lives
inside it:

| File | Holds |
|---|---|
| `<Name>.tsx` | The component (named export) |
| `<Name>.test.tsx` | Its tests — next to the code, never a parallel `__tests__/` tree |
| `SubPart.tsx` | A child used only by `<Name>` |
| `helpers.ts` | Pure functions only this component (and its children) use |
| `constants.ts` | Named constants for this component |
| `styles.ts` / `*.module.css` | Styles |
| `types.ts` | Only if types are shared by several files in the folder |
| `index.ts` | `export { Name } from "./Name";` — nothing else |

Create a file only when there is something to put in it; an empty
`constants.ts` "for later" is noise.

**Nesting.** A section inside a large component can get its own nested
`_components/` when it has several parts of its own. Keep nesting ≈ two
levels; nesting depth should track composition depth, not route depth.

## 4. Import direction

```
shared (components/, lib/, hooks/, vendor/)
        ↑ imported by
features/<domain>/
        ↑ imported by
app/ routes and layouts
```

- Shared never imports from a feature or route.
- A feature never imports another feature's internals; a route never imports
  another route's `_components/`. Need it in two places → promote it.
- Siblings inside one component folder may import each other freely.

Why: a one-way graph means changing a feature can't break shared code or a
sibling feature, and circular imports can't form.

## 5. Barrel files

Decision for this skill (see README for the debate):

- ✅ `ComponentFolder/index.ts` with a single re-export — lets callers write
  `import { X } from "./_components/X"` without exposing internals.
- ❌ Aggregating barrels re-exporting many modules (`components/index.ts`,
  `features/x/index.ts`, `lib/hooks/index.ts`). Costs: circular imports when a
  module imports its own folder's barrel; the dev server must load every
  module behind the barrel; bundler optimizations like `optimizePackageImports`
  can't handle "impure" barrels.
- Libraries (a published package's entry point) are the legitimate exception.

Existing aggregating barrels: don't expand them, prefer direct file imports in
new code, and don't refactor them away unasked.

## 6. Naming

- Component files and folders: `PascalCase` matching the component.
- Non-component modules: name by responsibility (`github-urls.ts`,
  `model-label.ts`), following the repo's existing casing.
- Hooks: `useNoun` / `useVerbNoun` describing a concrete use case
  (`useOnlineStatus`, `usePulls`) — not lifecycle wrappers (`useMount`).
- Private (non-routable) folders in `app/`: `_prefix`.
- Route groups for organization without URL change: `(group)`.

## 7. Enforcement

When a linter exists, encode the import direction instead of relying on
review:

- `import/no-restricted-paths` with zones (bulletproof-react's approach), or
  `eslint-plugin-boundaries` element types + allowed-dependency rules.
- `import/no-cycle` to catch barrel-induced cycles.

dev-digest has no lint script (see root `AGENTS.md`) — don't invent one;
use the review checklist in `SKILL.md`.
