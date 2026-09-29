# Severity rubric

One scale for every reviewer, identical to the product's own
(`server/src/vendor/shared/contracts/findings.ts` → `CRITICAL | WARNING | SUGGESTION`).
The gate blocks on **any** CRITICAL, like `ci_fail_on: 'critical'`.

A false CRITICAL stops someone from opening a PR, so the bar is high. **When
unsure between two levels, pick the lower one.**

## CRITICAL: must not ship

Use it only when the added or changed lines will do at least one of these:

- **Break at runtime**: a certain crash, a wrong result on the main path, an
  unhandled promise that kills the request, or an infinite render/effect loop.
- **Lose or corrupt data**: a destructive migration without a backfill, a
  write outside its transaction, or a unique or FK constraint silently dropped.
- **Open an exploitable hole** (security skill, HIGH confidence only):
  injection, missing authorization on a mutating route, a leaked secret or
  token, path traversal, or SSRF.
- **Break a MUST rule of the skill** that the repo relies on for correctness
  or layering. Examples:
  - onion-architecture: an inner ring imports an outer one (a service or
    domain type importing Fastify, Drizzle or an SDK); a Drizzle row type
    leaks out of a repository; a service pulls dependencies from the
    Container; a module imports another module's internals instead of its
    `index.ts`.
  - frontend-ui-architecture: a component calls `fetch` directly instead of
    going through a `src/lib/hooks/*` TanStack Query hook; a server-only
    module is imported into a `'use client'` tree.
  - next-best-practices: a server-only API is used in a client component; an
    async Server Component is rendered from a client component.
  - Repo rules from `AGENTS.md`: a hand-edited file under
    `server/src/db/migrations/*`, or snake/camel conversion skipped at the
    contract boundary so a DTO ships camelCase over the wire.

## WARNING: should fix, does not block

A real defect or convention break with no immediate damage. Examples: a
missing error path on a rare branch, a hook dependency array bug with no loop,
a weak type (`any`, a non-null `!` on external data), N+1 queries on a small
list, a misplaced helper or constant, a missing index on a new filter column,
or a test that asserts implementation details.

## SUGGESTION: nice to have

Style, naming, readability, a small simplification, docs.

## Mapping the skills' own scales

| Skill | Its level | → Ours |
|---|---|---|
| react-best-practices | CRITICAL | CRITICAL (only if it meets the bar above, otherwise WARNING) |
| react-best-practices | HIGH | WARNING |
| react-best-practices | MEDIUM | SUGGESTION |
| security | CRITICAL, HIGH (HIGH confidence) | CRITICAL |
| security | MEDIUM | WARNING |
| security | LOW, or any finding with less than HIGH confidence | SUGGESTION, or drop it |
| skills without levels (onion, frontend-ui, fastify, drizzle, zod, …) | a MUST / "never" rule from the Review checklist | CRITICAL when it meets the bar above |
| | a "prefer" / "should" rule | WARNING or SUGGESTION |

## Scope

- Judge only lines the diff **adds or changes**. Existing problems in
  untouched lines are out of scope. Mention one only if the change makes it
  worse.
- `line` is a line number in the **current** file.
