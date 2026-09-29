# Component decomposition

Read when a component is getting large, when extracting part of one, or when
deciding between a hook, a helper and a sub-component.

## When to split

Split along **responsibilities** (Thinking in React's single-responsibility
test). Good reasons:

- A section has **its own state** that the rest doesn't care about.
- A section **changes for a different reason** (different feature, different
  owner, different data).
- It is **reused**, or clearly about to be reused by a second caller.
- It is **hard to test in place** — you need to render the whole page to reach
  one behavior.
- The component body mixes **data wiring and rendering** so heavily that the
  JSX is hard to read.

Not good reasons on their own:

- Line count alone. ~200 lines is a prompt to look, not a verdict.
- Splitting a tiny piece of one-off markup, which only adds a props hop.
- "It might be reusable some day."

A split that forces 5+ props to be threaded through is a sign the boundary is
in the wrong place — try `children`/slots or keeping the state lower.

## Where the extracted piece goes

| Extracted piece | Home |
|---|---|
| Child rendered by exactly one parent | Sibling file in the parent's folder (`FindingsPanel/SeverityBar.tsx`) |
| Section reused within one route | Its own folder in that route's `_components/` |
| Component reused across routes | `src/components/<Name>/` |
| Pure computation | Function above the component, or `helpers.ts` |
| Stateful logic with effects / subscriptions | Custom hook in the same folder (`useThing.ts`) |

## Moving logic out of the render body

Walk this ladder and stop at the first step that works:

1. **Compute during render.** Derived values don't need state or effects
   (`const visible = items.filter(...)`).
2. **Pure function outside the component** — in the same file first, then
   `helpers.ts`. No `use` prefix: a function that calls no hooks is not a hook
   (react.dev).
3. **Custom hook** — when the logic owns state, effects, refs or subscribes to
   something external. Name it for the use case (`useChatRoom(roomId)`), not
   the mechanism (`useEffectOnce`). Each call gets its own state; to *share*
   state, lift it up or use context.

Some duplication is fine. Extract a hook when it clarifies intent or removes
real repetition, not for every two similar lines.

## Patterns

- **Composition over configuration.** Prefer `children` and slot props
  (`<Card header={...} footer={...}>`) to growing boolean props
  (`showHeader`, `compact`, `withFooter`...). Each boolean doubles the states
  to reason about.
- **Hooks, not containers.** Don't add a `XContainer` component that only
  fetches and passes props; call the data hook in the component that renders
  the data (or its nearest sensible parent).
- **Compound components** (`Tabs` + `Tabs.Panel`) are fine inside one
  environment. Across a Next.js server→client boundary, static members become
  `undefined` — export the parts as named exports instead
  (see nextjs-architecture.md).
- **State placement.** Put state in the closest common parent of the
  components that read it; don't hoist it to a page or global store "just in
  case". Lower state = fewer re-renders and less coupling.

## File rules

- One exported component per file; small private helpers/components in the
  same file are fine while they stay small.
- Named exports (`export function X`) — consistent import names, better
  refactors.
- Keep helpers and constants **above/outside** the component so they aren't
  recreated on each render and can be tested directly.

## Example: splitting a large panel

Before: `FindingsPanel.tsx` (380 lines) renders filters, a severity bar, the
list, and computes counts inline.

After:

```
FindingsPanel/
  FindingsPanel.tsx      # composes the parts, owns filter state
  SeverityBar.tsx        # private child → sibling file
  helpers.ts             # countBySeverity(), sortFindings() — pure, unit-tested
  constants.ts           # SEVERITY_ORDER, LOW_CONFIDENCE_THRESHOLD
  styles.ts
  FindingsPanel.test.tsx
  index.ts
```

The counts and sort order became pure functions (testable without
rendering), the magic threshold got a name, and `SeverityBar` stayed private
because nothing else renders it.
