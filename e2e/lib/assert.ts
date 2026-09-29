/**
 * Tiny helpers for the e2e runner. Assertions are intentionally minimal: most
 * of the "assert" work is done by agent-browser's own `wait --text` / `wait --url`
 * commands, which exit non-zero when the condition isn't met within the timeout.
 * These helpers only cover the extra substring checks and result bookkeeping.
 */

/** A single agent-browser invocation within a flow. */
export interface Step {
  /** agent-browser argv, e.g. ["wait", "--text", "#482"]. `{BASE}` is substituted. */
  cmd: string[];
  /** Human label for logs (defaults to the joined cmd). */
  label?: string;
  /** Optional extra check on the command's stdout (beyond its exit code). */
  assert?: { stdoutIncludes?: string };
}

export interface Flow {
  name: string;
  description?: string;
  steps: Step[];
}

/**
 * Validate a parsed `*.flow.json` against the Flow shape. A malformed spec
 * (typo'd key, `cmd` as a string) used to surface mid-run as an obscure
 * agent-browser failure; this fails at load time, naming the file and step.
 */
export function parseFlow(raw: unknown, file: string): Flow {
  const fail = (msg: string): never => {
    throw new Error(`${file}: ${msg}`);
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("expected a JSON object");
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== "string" || !o.name) fail('"name" must be a non-empty string');
  if (o.description !== undefined && typeof o.description !== "string") fail('"description" must be a string');
  if (!Array.isArray(o.steps) || o.steps.length === 0) fail('"steps" must be a non-empty array');
  (o.steps as unknown[]).forEach((s, i) => {
    const at = `step ${i + 1}`;
    if (!s || typeof s !== "object") fail(`${at}: expected an object`);
    const step = s as Record<string, unknown>;
    const cmd = step.cmd;
    if (!Array.isArray(cmd) || cmd.length === 0 || !cmd.every((a) => typeof a === "string"))
      fail(`${at}: "cmd" must be a non-empty array of strings`);
    if (step.label !== undefined && typeof step.label !== "string") fail(`${at}: "label" must be a string`);
    if (step.assert !== undefined) {
      const a = step.assert as Record<string, unknown> | null;
      if (!a || typeof a !== "object" || (a.stdoutIncludes !== undefined && typeof a.stdoutIncludes !== "string"))
        fail(`${at}: "assert.stdoutIncludes" must be a string`);
    }
  });
  return raw as Flow;
}

export interface StepResult {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface FlowResult {
  name: string;
  ok: boolean;
  steps: StepResult[];
}

/** Substitute `{BASE}` (and trim a trailing slash on BASE) in every arg. */
export function resolveArgs(cmd: string[], base: string): string[] {
  const b = base.replace(/\/+$/, "");
  return cmd.map((a) => a.replaceAll("{BASE}", b));
}

export function stdoutContains(stdout: string, needle: string): boolean {
  return stdout.includes(needle);
}

export function summarize(results: FlowResult[]): string {
  const lines: string[] = [];
  for (const f of results) {
    lines.push(`${f.ok ? "PASS" : "FAIL"}  ${f.name}`);
    for (const s of f.steps) {
      if (!s.ok) lines.push(`        ✗ ${s.label}${s.detail ? ` — ${s.detail}` : ""}`);
    }
  }
  const passed = results.filter((r) => r.ok).length;
  lines.push("");
  lines.push(`${passed}/${results.length} flows passed`);
  return lines.join("\n");
}
