/**
 * Prompt-injection vetting for SKILLS — body and name (shared kernel — pure).
 *
 * Scope: a skill body is pasted into the reviewer's system prompt as TRUSTED
 * instructions, so reviewer-core's INJECTION_GUARD (which fences untrusted PR
 * inputs as data) cannot protect it. This scanner is the vetting gate for that
 * one boundary: a flagged skill is kept disabled, can't be attached to an
 * agent, and is skipped at prompt assembly. It is deliberately a small set of
 * high-signal patterns aimed at skills that try to take over the reviewer —
 * it catches the obvious cases, NOT every phrasing or language, so a clean
 * report never means "safe". Never run it on PR inputs; that path stays with
 * INJECTION_GUARD (see server/AGENTS.md → Gotchas).
 *
 * Patterns avoid wording a legitimate security skill uses ("flag code that
 * bypasses security", "never flag formatting issues"): the targets are the
 * reviewer's own instructions, verdict and security findings.
 */

import { INJECTION_NAME_LINE } from '@devdigest/shared';

export type InjectionRule =
  | 'ignore_instructions'
  | 'role_override'
  | 'fake_role_header'
  | 'safety_override'
  | 'forced_verdict'
  | 'suppress_security'
  | 'prompt_exfiltration'
  | 'hidden_characters'
  | 'hidden_comment_instruction';

export interface InjectionFinding {
  rule: InjectionRule;
  /** 1-based line of the match in the scanned text; `INJECTION_NAME_LINE` (0)
   *  when it is in the skill's name (see `scanSkill`). */
  line: number;
  /** The matched line, trimmed and capped — enough to find and fix it. */
  excerpt: string;
}

export interface InjectionReport {
  detected: boolean;
  findings: InjectionFinding[];
}

const EXCERPT_MAX = 120;

/** Line-scoped patterns: each is tested against every line of the body. */
const LINE_RULES: readonly { rule: InjectionRule; re: RegExp }[] = [
  {
    rule: 'ignore_instructions',
    re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|preceding|system|original)\b[^.\n]{0,20}\b(instructions?|prompts?|rules|directions|guidelines)\b/i,
  },
  {
    rule: 'role_override',
    re: /\byou are now\b[^.\n]{0,60}\b(assistant|ai|model|agent|bot|reviewer)\b|\b(with|without|has) no (restrictions|limits|limitations|rules|filters)\b|\b(jailbreak|jailbroken|DAN mode|developer mode)\b/i,
  },
  { rule: 'fake_role_header', re: /^\s*(#+\s*)?(system|assistant|developer)\s*:/i },
  {
    rule: 'safety_override',
    re: /\b(override|bypass|disable|turn off)\b[^.\n]{0,30}\b(safety|guidelines|guardrails|content polic(y|ies)|system prompt)\b/i,
  },
  {
    rule: 'forced_verdict',
    // `\s*(?:(?:of|:|=)\s*)?` rather than `\s*(of|:|=)?\s*`: two adjacent `\s*`
    // around an optional group backtrack quadratically on a long run of spaces.
    re: /\b(always|must|unconditionally)\s+(approve|merge)\b|\bapprove (all|every|any)\b[^.\n]{0,20}\b(prs?|pull requests?|changes|diffs?)\b|\b(always\s+(give|return|set|output)\b[^.\n]{0,20}\bscore\b|score\s*(?:(?:of|:|=)\s*)?100\b)|\bverdict\s*(?:(?:of|:|=)\s*)?["']?approve\b/i,
  },
  {
    rule: 'suppress_security',
    re: /\b(never|don'?t|do not|must not)\s+(flag|report|mention|raise|surface)\b[^.\n]{0,30}\b(security|vulnerabilit(y|ies)|cves?)\b/i,
  },
  {
    rule: 'prompt_exfiltration',
    re: /\b(output|reveal|print|show|repeat|leak|dump|disclose)\b[^.\n]{0,30}\b(system prompts?|your (system )?instructions|(all|the) (system )?prompts|agent configurations?)\b/i,
  },
];

/**
 * Invisible text that hides instructions: the soft hyphen (U+00AD), combining
 * grapheme joiner (U+034F), Mongolian vowel separator (U+180E), zero-width and
 * bidi controls (U+200B–200F, U+202A–202E), word joiners and bidi isolates
 * (U+2060–2069, "Trojan Source"), the BOM, Unicode tag characters
 * (U+E0000–E007F: an invisible copy of ASCII a model still reads) and the
 * supplementary variation selectors (U+E0100–E01EF). Each is flagged on sight.
 */
const HIDDEN_CHARS =
  /[\u00AD\u034F\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/u;

/**
 * Removed before the rules run, so an invisible character wedged inside a
 * keyword ("ig<U+00AD>nore") can't split it. Adds the basic variation
 * selectors (U+FE00–FE0F), which are NOT flagged on their own: U+FE0F is part
 * of ordinary emoji like the warning sign legit skills use.
 */
const FOLD_STRIP = new RegExp(`${HIDDEN_CHARS.source}|[\\uFE00-\\uFE0F]`, 'gu');

/** HTML comment delimiters — a comment is invisible once rendered. */
const COMMENT_OPEN = '<!--';
const COMMENT_CLOSE = '-->';
/** Comment text that talks to the model. */
const COMMENT_INSTRUCTION = /\b(ignore|instructions?|system|assistant|you are|you must|approve|do not (flag|report))\b/i;

function excerptOf(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > EXCERPT_MAX ? `${trimmed.slice(0, EXCERPT_MAX - 1)}…` : trimmed;
}

/**
 * Every HTML comment as `{ start, body }`, in one linear pass (a lazy
 * `<!--[\s\S]*?-->` regex goes quadratic on a body full of unclosed `<!--`).
 * An unclosed comment runs to the end of the text — that's how a renderer
 * treats it, so everything after it is hidden too.
 */
function htmlComments(text: string): { start: number; body: string }[] {
  const out: { start: number; body: string }[] = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf(COMMENT_OPEN, from);
    if (start === -1) return out;
    const bodyStart = start + COMMENT_OPEN.length;
    const end = text.indexOf(COMMENT_CLOSE, bodyStart);
    out.push({ start, body: text.slice(bodyStart, end === -1 ? undefined : end) });
    if (end === -1) return out;
    from = end + COMMENT_CLOSE.length;
  }
}

/** Scan a skill body; one finding per (rule, line). */
export function scanForInjection(text: string): InjectionReport {
  const findings: InjectionFinding[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((raw, i) => {
    // Rules match the line with invisible characters removed, in NFKC form:
    // fullwidth/compatibility letters ("ｉｇｎｏｒｅ") and a keyword split by an
    // invisible character read as plain words to the model but slip past an
    // ASCII regex.
    const folded = raw.replace(FOLD_STRIP, '').normalize('NFKC');
    for (const { rule, re } of LINE_RULES) {
      if (re.test(folded)) findings.push({ rule, line: i + 1, excerpt: excerptOf(raw) });
    }
    if (HIDDEN_CHARS.test(raw)) {
      findings.push({
        rule: 'hidden_characters',
        line: i + 1,
        excerpt: excerptOf(raw.replace(new RegExp(HIDDEN_CHARS.source, 'gu'), '⟨?⟩')),
      });
    }
  });

  // Comments come in text order, so the line counter only ever moves forward.
  let line = 1;
  let counted = 0;
  for (const { start, body } of htmlComments(text)) {
    for (; counted < start; counted++) if (text.charCodeAt(counted) === 10) line += 1;
    if (!COMMENT_INSTRUCTION.test(body)) continue;
    findings.push({ rule: 'hidden_comment_instruction', line, excerpt: excerptOf(lines[line - 1] ?? '') });
  }

  findings.sort((a, b) => a.line - b.line);
  return { detected: findings.length > 0, findings };
}

/**
 * Scan everything a skill contributes to a prompt: its body AND its name —
 * the run renders each skill as `### <name>\n<body>`, and an imported file's
 * frontmatter `name:` is as untrusted as its body. Body findings keep their
 * body line numbers; name findings carry `INJECTION_NAME_LINE`.
 */
export function scanSkill(name: string, body: string): InjectionReport {
  const inName = scanForInjection(name).findings.map((f) => ({ ...f, line: INJECTION_NAME_LINE }));
  const findings = [...inName, ...scanForInjection(body).findings];
  return { detected: findings.length > 0, findings };
}
