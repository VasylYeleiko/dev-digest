# client/INSIGHTS

Append-only log of gotchas, decisions, and "why is it done this way" notes for
this package. Newest entry on top within each section, dated. Entries are only
ever added — a superseded note is corrected by a new dated entry, never edited
in place. When a note here turns out to be load-bearing for every session,
promote its one-line summary into [`AGENTS.md`](AGENTS.md) instead of leaving it
buried.

Written by the `engineering-insights` skill. Format:
`### YYYY-MM-DD — short title` + one to three sentences citing `file.tsx:42`.

## What Works

## What Doesn't Work

### 2026-09-26 — never diff a version against the skill's CURRENT body — diff against the PREVIOUS version instead

`VersionsTab`'s "Diff" button used to call `diffLines(pastVersion.body, skill.body)` — comparing every past version to whatever the skill's body is *right now*. For the current version that's a no-op diff (body vs. itself, always empty), and for older versions it shows "everything that changed since today" rather than what that specific save actually changed. `useSkillVersions` returns versions newest-first (server `ORDER BY version DESC`), so the correct predecessor is simply `versions[i + 1]`; the oldest version has no predecessor and gets no Diff button at all. Evidence: `src/app/skills/[id]/_components/SkillEditor/_components/VersionsTab/VersionsTab.tsx`.

### 2026-09-26 — `vendor/ui`'s `Checkbox` has no `disabled` prop — omit `onChange` to make clicks a no-op

`Checkbox` (`vendor/ui/kit/Checkbox.tsx`) always calls `onChange?.(!checked)` on click and has no `disabled` styling/logic of its own. `vendor/ui` is do-not-touch (see the 2026-09-20 Dropdown entry below for the same constraint), so to make one row's checkbox unclickable, pass `onChange={undefined}` instead of a handler — the click then no-ops safely. Note the wrapping `<label>` still shows a pointer cursor and the checkbox still visually toggles focus outlines; pair it with a dimmed row (`opacity`) so it *reads* as disabled too. Evidence: `src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx` (a disabled-and-not-yet-linked skill's checkbox).

### 2026-09-25 — corrects the 2026-09-24 entry below: don't strip `.js` extensions from `vendor/shared` — use `next.config.mjs`'s `webpack.resolve.extensionAlias` instead

Stripping `.js` from the client's relative exports (as the entry below
describes) does fix `next build`/`next dev`, but it makes `client/src/vendor/shared/contracts/*.ts`
byte-different from the server source — `pr-self-review`'s `shared-mirror`
check (and `client.yml` CI's `diff -r … contracts`) flags every such file as a
CRITICAL "contract mirror drifted", and that's a `source: "check"` finding —
`accepted.json` cannot waive it. The correct fix keeps `.js` extensions
everywhere (server and client byte-identical, as intended) and instead teaches
webpack the same `.js`→`.ts` extension mapping tsc's `moduleResolution:
"Bundler"` already does, via `client/next.config.mjs`:
```js
webpack: (config) => {
  config.resolve.extensionAlias = { ...config.resolve.extensionAlias, ".js": [".ts", ".tsx", ".js"] };
  return config;
},
```
Evidence: `client/next.config.mjs`.

### 2026-09-24 — client `vendor/shared` relative exports must NOT use `.js` extensions — they break `next build`/`next dev` the moment any file does a real (non-type) import

Every `@devdigest/shared` import in this package was `import type` until this
session — SWC elides type-only imports entirely, so webpack never actually had
to resolve `client/src/vendor/shared/index.ts` as a real module. The barrel's
exports used `.js` extensions (`export * from './contracts/findings.js'`,
needed for the server copy's Node/tsx ESM execution) which webpack's bundler
resolution does not follow the way tsc's `moduleResolution: "Bundler"` does —
the FIRST real value import (`import { SkillType } from "@devdigest/shared"`,
needed for `.options`) broke `next build`/`next dev` for the WHOLE app with
"Module not found: Can't resolve './contracts/findings.js'", not just the
importing route. Invisible to `pnpm typecheck` (tsc resolves fine) and `pnpm
test` (vite resolves fine) — only a real `next build`/`next dev` catches it,
and CI never runs `next build`. Fix: `client/src/vendor/shared/index.ts` AND
every internal relative import inside `client/src/vendor/shared/contracts/*.ts`
must be extensionless (`export * from './contracts/findings'`); the server
copies keep `.js` — Node ESM/tsx needs it there, so the two are correctly NOT
byte-identical on this point. Evidence: `client/src/vendor/shared/index.ts`,
`client/src/vendor/shared/contracts/{eval-ci,platform,observability,productionize,review-api}.ts`.

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

### 2026-09-23 — a component rendered once per review run must not own a bare `window` keydown listener

`ReviewRunAccordion` renders one `FindingsPanel` per expanded run, so a
`window.addEventListener("keydown", …)` inside the panel fires N times per key:
one `a` accepted the focused finding in EVERY open run. Shortcut ownership now
goes through `useShortcutOwner()` (first mounted panel owns the keys; a
pointer/focus inside another panel claims them; the next panel takes over on
unmount) — reuse it for any new per-run keyboard shortcut. Evidence:
`src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/activePanel.ts`,
the "several panels open" tests in `FindingsPanel.test.tsx`.

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

### 2026-09-24 — jsdom has no `File.prototype.arrayBuffer()` — use `FileReader.readAsArrayBuffer` for client-side file reads in tests

Calling `file.arrayBuffer()` throws `TypeError: file.arrayBuffer is not a
function` in this package's vitest+jsdom environment, silently swallowed by
any surrounding try/catch (e.g. an import mutation's error handler), so a
file-upload flow just looks like it never fired instead of erroring visibly.
`FileReader.readAsArrayBuffer` works identically in jsdom and every real
browser — use it for any client-side file→bytes conversion. Evidence:
`client/src/app/skills/_components/AddSkillDrawer/helpers.ts` (`fileToBase64`).

### 2026-09-23 — jsdom has no `isContentEditable`, so contentEditable guards can't be tested in vitest

`element.isContentEditable` is `undefined` in jsdom even after
`el.contentEditable = "true"`, so `isTextInput()` (`components/app-shell/helpers.ts`)
returns false there and a test "typing in a contentEditable doesn't trigger the
shortcut" fails although the browser behaves correctly. Assert the guard with a
`<textarea>`/`<input>` instead, and don't "fix" the helper to satisfy jsdom.
Evidence: `FindingsPanel.test.tsx` ("ignores Ctrl/Cmd combos and typing in a text field").

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

### 2026-09-23 — moving UI strings into `messages/en/*.json` must keep the English byte-identical: e2e flows wait on exact text

The agent-browser flows locate by visible text — `04-pr-findings.flow.json`
waits for `request changes` and `2 findings` in the review-run accordion
header. When i18n-ing a component, copy the literal value (plurals as ICU:
`{count, plural, one {# finding} other {# findings}}` renders the same
string) and don't "improve" wording or casing in the same change. The
accordion's verdict badge still renders `verdict.replace("_", " ")` for this
reason. Evidence: `ReviewRunAccordion.test.tsx` pins the e2e strings.

## Recurring Errors & Fixes

## Session Notes

### 2026-09-17 — CLAUDE.md/docs/specs/INSIGHTS scaffolding added

Seeded this file alongside `CLAUDE.md`, `docs/`, and `specs/` for the package.
No entries yet beyond what's already inlined as a gotcha in `CLAUDE.md`
(component tests mock `fetch`, real journeys live in `e2e/`).

## Open Questions
