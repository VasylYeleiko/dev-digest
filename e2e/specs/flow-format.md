# `.flow.json` format — the contract every spec must satisfy

Not itself a flow (the runner only loads `*.flow.json` — see `run.ts`'s
`loadFlows`), this pins the JSON shape a `specs/NN-name.flow.json` file must
have, sourced from `lib/assert.ts`'s `Flow`/`Step` types. For how the runner
executes this shape, see [../docs/flow-runner.md](../docs/flow-runner.md).

## Shape

```ts
interface Flow {
  name: string;            // shown in the console header when the flow starts
  description?: string;    // not printed by the runner; documents intent/preconditions for a human reading the spec
  steps: Step[];
}

interface Step {
  cmd: string[];                          // agent-browser argv; "{BASE}" is substituted
  label?: string;                         // console label; defaults to the joined cmd
  assert?: { stdoutIncludes?: string };   // optional extra substring check on this step's stdout
}
```

## Rules a spec must follow

1. **File name is `NN-kebab-name.flow.json`** — `NN` controls run order
   (lexical), not priority; a later-numbered flow may rely on state a
   lower-numbered one left behind (the runner shares one browser session
   across all flows — see the runner doc), so don't renumber an existing spec
   without checking what depends on its position.
2. **`{BASE}` is the only templated token**, substituted with `E2E_BASE_URL`
   (default `http://localhost:3000`, trailing slash trimmed). There is no
   other variable substitution — a step that needs a computed value (a PR
   number, a repo id) hardcodes it against the known seeded fixture instead.
3. **A step's assertion is `wait --text <substring>` or `wait --url
   <substring>`, not a separate assert block.** `assert.stdoutIncludes` exists
   only for the rare case where a command's own stdout — not the page state —
   needs checking; it is not a replacement for `wait`.
4. **Locators are deterministic only**: `find role|text|label <value> click`,
   `wait --text`, `wait --url`. The AI `chat` command is never used — that's
   what keeps a run stable and key-free (`README.md`'s framing: no
   Playwright, no LLM, no API key).
5. **Every flow assumes read-only seeded data** — the demo repo
   `acme/payments-api`, PR #482, the seeded reviewer agents. A spec never
   triggers a real review (no model call) and never submits a form that would
   mutate seeded state a later flow depends on (`06-onboarding` explicitly
   stops short of submitting its form — see `README.md`'s coverage table).

## Do not touch

Per `e2e/CLAUDE.md`: don't hand-edit a `.flow.json` file into a shape this
spec doesn't describe (e.g. adding a `chat` step, or a template token besides
`{BASE}`) — author new flows as command lists following this contract, using
an existing spec as the starting template.

## Acceptance

A `.flow.json` file conforms to this spec if and only if: it parses as the
`Flow` shape above, every `step.cmd[0]` is a valid `agent-browser` subcommand,
every locator command is deterministic (rule 4), and the flow's steps never
depend on unseeded or mutated data (rule 5).
