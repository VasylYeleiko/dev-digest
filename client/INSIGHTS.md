# client/INSIGHTS

Append-only log of gotchas, decisions, and "why is it done this way" notes for
this package. Newest entry on top within each section, dated. Entries are only
ever added — a superseded note is corrected by a new dated entry, never edited
in place. When a note here turns out to be load-bearing for every session,
promote its one-line summary into [`CLAUDE.md`](CLAUDE.md) instead of leaving it
buried.

Written by the `engineering-insights` skill. Format:
`### YYYY-MM-DD — short title` + one to three sentences citing `file.tsx:42`.

## What Works

## What Doesn't Work

### 2026-09-20 — `vendor/ui`'s `Dropdown` can't host a checkbox / multi-select row

`DropdownItem` calls `it.onClick?.()` then unconditionally `onClose()` on
every click (`vendor/ui/kit/Dropdown.tsx:12-15`), and `DropdownItemDef` has
no slot for arbitrary content — there is no way to keep the menu open across
multiple clicks (e.g. a checkbox list building a selection). `vendor/ui` is
do-not-touch, so don't try to extend `Dropdown`/`DropdownItemDef` for this;
build a small local menu instead, reusing the same visual tokens (border,
`border-radius: 9`, `box-shadow: var(--shadow-modal)`, the `ddpop` animation
class) but with your own `open` state + outside-click listener. Evidence:
`src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.tsx`.

## Codebase Patterns

### 2026-09-20 — `SeverityBadge compact` renders icon + count with NO label at all — needs its own `aria-label` for a11y and for deterministic browser-automation locators

Unlike the non-compact case (label + nested `.tnum` count span, see the RTL
entry below), `compact` mode (`vendor/ui/primitives/Badge.tsx`'s
`SeverityBadge`) drops the label text node entirely — the badge is icon-only
plus a bare count. That makes it invisible to both screen readers and to
`find text`/`find role` style automation (agent-browser's e2e flows have no
`hover` command and no CSS-selector locator, only text/role/label). A
clickable trigger wrapping compact badges needs an explicit `aria-label` on
the trigger itself, not on the badges — see `FindingsPopover.tsx`'s
`aria-label={t("list.findingsTrigger", …)}`, reused by both the PR-list
FINDINGS cell and the PR-detail TIMELINE's per-run popover.

### 2026-09-20 — an ancestor `overflow: hidden` silently clips any absolutely-positioned popover, and this codebase has no portal primitive

Several list/table containers (e.g. `pulls/styles.ts:97`'s `tableCard`) set
`overflow: hidden` specifically to clip rounded corners — but that same box
clips ANY `position: absolute` descendant that would extend past its
in-flow content bounds, including a hover popover nested several levels
down. `vendor/ui/kit/Dropdown.tsx` has the identical latent bug (same
`position: absolute` pattern), it just hasn't been triggered from inside an
`overflow: hidden` ancestor yet. There is no `createPortal`/floating-ui
primitive anywhere in the codebase (repo-wide grep for `createPortal` was
empty before this fix) — a popover that must render outside a clipping
ancestor needs `createPortal(panel, document.body)` plus its own
`getBoundingClientRect()`-based position calc (with a `scroll`/`resize`
listener while open, since the app shell's `<main>` is itself a scroll
container — `vendor/ui/shell/AppFrame.tsx:29`). Evidence:
`src/components/FindingsPopover/FindingsPopover.tsx`.

### 2026-09-18 — in `FindingsTab`, `runs` is NOT the runs

`FindingsTab` takes both `runs: ReviewRecord[]` (the persisted **reviews**) and
`prRuns: RunSummary[]` (the **agent runs**, which carry status, tokens and
cost). Per-run telemetry only exists on `prRuns`; reach it from a review via
`prRuns.find(r => r.run_id === review.run_id)`, which can legitimately miss when
the run was deleted. Reading the names instead of the prop types silently yields
`undefined`. Evidence: `src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:17`.

## Tool & Library Notes

### 2026-09-19 — RTL `getByText` can't match a Badge's label+count as one string

`SeverityBadge`/`Badge` (`vendor/ui/primitives/Badge.tsx`) render a count in a
NESTED `<span class="tnum">`, sibling to a bare label text node. RTL's default
`getNodeText` only concatenates a node's own direct text-node children, not
descendant elements' text, so `getByText(/Critical2/)` never matches either
span. Query the label first (`getByText("Critical")`, which returns the outer
badge element) and read the count off `badge.querySelector(".tnum")` instead.
Evidence: `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.test.tsx`
(`pillCount` helper).

## Decisions

## Recurring Errors & Fixes

## Session Notes

### 2026-09-17 — CLAUDE.md/docs/specs/INSIGHTS scaffolding added

Seeded this file alongside `CLAUDE.md`, `docs/`, and `specs/` for the package.
No entries yet beyond what's already inlined as a gotcha in `CLAUDE.md`
(component tests mock `fetch`, real journeys live in `e2e/`).

## Open Questions
