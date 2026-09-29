#!/usr/bin/env node
// Final step of /pr-self-review. Merges deterministic check findings
// (checks.json) with reviewer findings (fresh ones from llm-findings.json +
// cached ones), dedupes, applies accepted.json, and writes the verdict the
// PreToolUse gate reads: .claude/pr-self-review/last-run.json (+ report.md).
//
//   node .claude/skills/pr-self-review/scripts/verdict.mjs [--quick | --skills=a,b] [--llm-skipped]

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cachedFindings, loadCache, parseSkillArgs, pruneCache, saveCache, selectSkills, storeResults } from './cache.mjs';
import { collectDiffState, stateDir } from './diff-state.mjs';

export const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'];
const rank = (s) => {
  const i = SEVERITIES.indexOf(s);
  return i === -1 ? SEVERITIES.length : i;
};
const MAX_ACCEPT_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- accepted.json

/** Splits accepted.json entries into usable ones and ignored ones (with why). */
export function validateAccepted(entries, today = new Date()) {
  const valid = [];
  const ignored = [];
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (const entry of Array.isArray(entries) ? entries : []) {
    const missing = ['skill', 'file', 'match', 'reason', 'expires'].filter((k) => typeof entry?.[k] !== 'string' || !entry[k].trim());
    let why = null;
    if (missing.length) why = `missing ${missing.join(', ')}`;
    else if (entry.skill === 'checks') why = 'deterministic check findings cannot be accepted';
    else {
      const exp = /^\d{4}-\d{2}-\d{2}$/.test(entry.expires) ? Date.parse(entry.expires + 'T00:00:00Z') : NaN;
      if (Number.isNaN(exp)) why = 'expires must be YYYY-MM-DD';
      else if (exp < todayUtc) why = `expired on ${entry.expires}`;
      else if (exp - todayUtc > MAX_ACCEPT_DAYS * DAY_MS) why = `expires more than ${MAX_ACCEPT_DAYS} days out`;
    }
    if (why) ignored.push({ entry, why });
    else valid.push(entry);
  }
  return { valid, ignored };
}

export function loadAccepted(root, today) {
  const p = join(root, '.claude/pr-self-review/accepted.json');
  if (!existsSync(p)) return { valid: [], ignored: [] };
  try {
    return validateAccepted(JSON.parse(readFileSync(p, 'utf8')), today);
  } catch (err) {
    return { valid: [], ignored: [{ entry: null, why: `accepted.json is not valid JSON: ${err.message}` }] };
  }
}

export function applyAccepted(findings, accepted) {
  const kept = [];
  const matched = [];
  for (const f of findings) {
    const a = f.source !== 'check' && accepted.find((e) =>
      e.skill === f.skill && e.file === f.file && (!e.rule || e.rule === f.rule) &&
      `${f.rule ?? ''}\n${f.evidence ?? ''}`.includes(e.match));
    if (a) matched.push({ ...f, accepted: { reason: a.reason, expires: a.expires, by: a.by ?? null } });
    else kept.push(f);
  }
  return { kept, accepted: matched };
}

// ---------------------------------------------------------------- dedupe

/** Reviewer findings on the same file:line from several skills collapse into the most severe one. */
export function dedupe(findings) {
  const out = [];
  const byLine = new Map();
  for (const f of findings) {
    if (f.source === 'check' || f.line == null) {
      out.push(f);
      continue;
    }
    const k = `${f.file}:${f.line}`;
    const prev = byLine.get(k);
    if (!prev) {
      const copy = { ...f, also: [] };
      byLine.set(k, copy);
      out.push(copy);
      continue;
    }
    const other = { skill: f.skill, severity: f.severity, rule: f.rule };
    if (rank(f.severity) < rank(prev.severity)) {
      const demoted = { skill: prev.skill, severity: prev.severity, rule: prev.rule };
      Object.assign(prev, f, { also: [...prev.also, demoted] });
    } else {
      prev.also.push(other);
    }
  }
  for (const f of out) if (Array.isArray(f.also) && !f.also.length) delete f.also;
  return out;
}

export function countBySeverity(findings) {
  return Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]));
}

export function decide({ counts, missing, llmSkipped }) {
  if (counts.CRITICAL > 0) return 'BLOCKED';
  if (llmSkipped || missing.length) return 'INCOMPLETE';
  return 'PASS';
}

// ---------------------------------------------------------------- report

function loc(f) {
  return f.line ? `${f.file}:${f.line}` : f.file;
}

function cell(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

export function renderReport(run) {
  const lines = [
    `# pr-self-review — ${run.verdict}`,
    '',
    `mode \`${run.mode}\` · base \`${run.base.ref}\` ${run.base.sha.slice(0, 8)} · hash \`${run.hash.slice(0, 12)}\` · ${run.at}`,
    '',
    `CRITICAL **${run.counts.CRITICAL}** · WARNING **${run.counts.WARNING}** · SUGGESTION **${run.counts.SUGGESTION}** · accepted ${run.accepted.length}`,
    '',
  ];
  if (run.missing.length) {
    lines.push(`**Not reviewed** (${run.missing.length} skill/file pairs) — verdict cannot be PASS until they are:`, '');
    for (const m of run.missing.slice(0, 30)) lines.push(`- ${m.skill} → ${m.file}`);
    if (run.missing.length > 30) lines.push(`- … ${run.missing.length - 30} more`);
    lines.push('');
  }
  for (const sev of SEVERITIES) {
    const list = run.findings.filter((f) => f.severity === sev);
    if (!list.length) continue;
    lines.push(`## ${sev} (${list.length})`, '', '| Where | Skill | Rule | Evidence | Fix |', '|---|---|---|---|---|');
    for (const f of list) {
      const skills = [f.skill, ...(f.also ?? []).map((a) => a.skill)].join(', ');
      lines.push(`| ${cell(loc(f))} | ${cell(skills)} | ${cell(f.rule)} | ${cell(f.evidence)} | ${cell(f.fix)} |`);
    }
    lines.push('');
  }
  if (run.accepted.length) {
    lines.push('## Accepted', '');
    for (const f of run.accepted) lines.push(`- ${loc(f)} — ${f.skill}: ${f.rule} — _${f.accepted.reason}_ (until ${f.accepted.expires})`);
    lines.push('');
  }
  if (run.acceptedIgnored.length) {
    lines.push('## Ignored accepted.json entries', '');
    for (const i of run.acceptedIgnored) lines.push(`- ${i.entry ? `${i.entry.skill ?? '?'} ${i.entry.file ?? '?'}` : 'file'}: ${i.why}`);
    lines.push('');
  }
  if (run.unrouted.length) lines.push(`> Unrouted skills (not reviewed — add them to routing.json or nonReview): ${run.unrouted.join(', ')}`, '');
  return lines.join('\n');
}

// ---------------------------------------------------------------- CLI

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  const argv = process.argv.slice(2);
  try {
    const state = collectDiffState();
    const dir = stateDir(state.root);
    mkdirSync(dir, { recursive: true });

    const checksPath = join(dir, 'checks.json');
    if (!existsSync(checksPath)) throw new Error('checks.json missing — run checks.mjs first');
    const checks = readJson(checksPath);
    if (checks.hash !== state.hash) throw new Error('checks.json is stale (the diff changed since) — re-run checks.mjs');
    if (!checks.complete) throw new Error('checks.json came from --static — run checks.mjs without --static');

    // Fresh reviewer results are consumed once: stored into the cache, then
    // deleted. A leftover from an older change set is discarded — its pairs
    // simply show up as `missing` (INCOMPLETE), never as reviewed.
    const cache = loadCache(state.root);
    let dropped = [];
    let staleLlmFindings = false;
    const llmPath = join(dir, 'llm-findings.json');
    if (existsSync(llmPath)) {
      const llm = readJson(llmPath);
      if (llm.hash === state.hash) ({ dropped } = storeResults(state, cache, llm));
      else staleLlmFindings = true;
      unlinkSync(llmPath);
    }
    pruneCache(state, cache);
    saveCache(state.root, cache);

    const selection = parseSkillArgs(argv);
    const mode = selection.quick ? 'quick' : selection.skills ? 'skills' : 'full';
    const skills = selectSkills(state, selection);
    const llmSkipped = argv.includes('--llm-skipped');
    if (llmSkipped && !checks.findings.some((f) => f.severity === 'CRITICAL')) {
      throw new Error('--llm-skipped is only allowed when the checks already found a CRITICAL');
    }
    const { findings: reviewFindings, missing } = llmSkipped ? { findings: [], missing: [] } : cachedFindings(state, cache, skills);

    const { valid, ignored } = loadAccepted(state.root);
    const { kept, accepted } = applyAccepted(dedupe([...checks.findings, ...reviewFindings]), valid);
    kept.sort((a, b) => rank(a.severity) - rank(b.severity) || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
    const counts = countBySeverity(kept);

    const run = {
      verdict: decide({ counts, missing, llmSkipped }),
      mode,
      hash: state.hash,
      base: state.base,
      head: state.head,
      packages: state.packages,
      skills: Object.fromEntries(skills.map((s) => [s, { files: state.bySkill[s].files.length, model: state.bySkill[s].model }])),
      checksRan: checks.ran,
      llmSkipped,
      counts,
      findings: kept,
      accepted,
      acceptedIgnored: ignored,
      missing,
      dropped,
      unrouted: state.unrouted,
      at: new Date().toISOString(),
    };
    writeFileSync(join(dir, 'last-run.json'), JSON.stringify(run, null, 2));
    writeFileSync(join(dir, 'report.md'), renderReport(run));
    process.stdout.write(JSON.stringify({
      verdict: run.verdict, mode, counts, accepted: accepted.length, acceptedIgnored: ignored.length,
      missing: missing.length, dropped: dropped.length, staleLlmFindings, report: join(dir, 'report.md'),
    }, null, 2) + '\n');
    process.exit(run.verdict === 'PASS' ? 0 : 1);
  } catch (err) {
    process.stderr.write(`verdict: ${err.message}\n`);
    process.exit(2);
  }
}
