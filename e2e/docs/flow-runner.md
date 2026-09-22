# Flow runner — how `run.ts` executes a spec

The runner's own architecture: session lifecycle, failure handling, and exit
code semantics. For the flow file's format (what you actually write when
adding a spec), see [../specs/flow-format.md](../specs/flow-format.md); for
the quickstart and the coverage table, see [../README.md](../README.md) —
this file doesn't repeat either.

## One browser session, many flows

`agent-browser` is a CDP-driving CLI, not a test framework — each invocation
is a separate process, but the **daemon it talks to keeps the page between
invocations**. `run.ts` exploits that: every flow in `specs/*.flow.json` runs
against the same browser session, in lexical filename order (hence the
`NN-` prefix — see the spec-format doc for why that's ordering, not
precedence). There is no per-flow `beforeEach` that resets navigation state;
a flow that assumes a specific starting URL begins with its own
`open`/`wait --url` steps rather than relying on where the previous flow left
off.

The session is torn down exactly once, in a `finally` around the whole run
(`ab(["close"])`, best-effort — its own failure is swallowed) — so a crash
mid-suite still releases the browser.

## A step either passes or ends its flow

`runFlow` iterates a flow's `steps` in order and **stops at the first
failure** — later steps in that flow don't run, but earlier already-completed
steps stay recorded as passed. A step can fail two ways:

1. **The `agent-browser` process exits non-zero.** This is the primary
   assertion mechanism: `wait --text`/`wait --url` block until their
   condition holds or `E2E_STEP_TIMEOUT` (default 60000ms) elapses, then exit
   non-zero on timeout. The runner catches the rejected `exec`, records the
   step's failure with the error's first line as `detail`, and — since this
   is the only failure path that indicates something is actually wrong with
   the app under test, not just a malformed command — writes a screenshot to
   `test-results/<spec-id>-fail.png` before moving on.
2. **The step's own `stdout` fails an optional `assert.stdoutIncludes`
   check.** The command itself succeeded (exit 0), but its output didn't
   contain the required substring. No screenshot here — the browser state
   isn't necessarily wrong, the assertion is checking the command's *report*
   of that state.

## Exit code

`main()` exits `0` only when every flow's every step passed; `1` otherwise
(including "no specs found in `specs/`", a config error worth failing loud
on) — this is the signal `scripts/e2e.sh` and the CI workflow both key off of.
`summarize()` prints a `PASS`/`FAIL` line per flow and lists each failed
step's label + detail, so a red CI run points at the specific step without
needing the full log.

## What the runner deliberately does not do

No retries, no parallelism across flows (would break the shared-session
assumption above), no AI-driven locators (`agent-browser`'s `chat` command is
never invoked — see the spec-format doc's Do-not-touch). Flakiness in a flow
is a signal to fix the flow's locators or waits, not to paper over with a
retry loop.
