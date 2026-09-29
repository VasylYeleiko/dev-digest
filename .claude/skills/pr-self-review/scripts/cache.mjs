#!/usr/bin/env node
// Incremental review cache: findings per (skill, file), valid while both the
// file's content hash and the skill's hash (its SKILL.md + this skill's
// reviewer prompt and severity rubric) are unchanged. Only uncached pairs get
// a reviewer subagent.
//
//   node .claude/skills/pr-self-review/scripts/cache.mjs plan [--fresh] [--quick | --skills=a,b]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SKILL_DIR, collectDiffState, sha256, stateDir } from './diff-state.mjs';

const CACHE_VERSION = 1;

export function skillHash(root, skill) {
  const read = (p) => (existsSync(p) ? readFileSync(p) : Buffer.alloc(0));
  return sha256(
    read(join(root, '.claude/skills', skill, 'SKILL.md')),
    read(join(SKILL_DIR, 'references/reviewer-prompt.md')),
    read(join(SKILL_DIR, 'references/severity.md')),
  );
}

export function loadCache(root) {
  const p = join(stateDir(root), 'cache.json');
  try {
    const c = JSON.parse(readFileSync(p, 'utf8'));
    if (c.version === CACHE_VERSION) return c;
  } catch {
    // missing or corrupt → start empty
  }
  return { version: CACHE_VERSION, entries: {} };
}

export function saveCache(root, cache) {
  mkdirSync(stateDir(root), { recursive: true });
  writeFileSync(join(stateDir(root), 'cache.json'), JSON.stringify(cache));
}

const key = (skill, path) => `${skill}\u0000${path}`;

/** Which review skills a run covers. */
export function selectSkills(state, { quick = false, skills = null } = {}) {
  const routed = Object.keys(state.bySkill);
  if (quick) return routed.filter((s) => s === 'security');
  if (skills) return routed.filter((s) => skills.includes(s));
  return routed;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Per skill: which files are cached and which need a reviewer, split into chunks. */
export function planReview(state, cache, { fresh = false, skills } = {}) {
  const plan = {};
  const fileHashes = new Map(state.files.map((f) => [f.path, f.fileHash]));
  for (const skill of skills) {
    const { model, chunkSize, files } = state.bySkill[skill];
    const sh = skillHash(state.root, skill);
    const cached = [];
    const pending = [];
    for (const path of files) {
      const e = cache.entries[key(skill, path)];
      if (!fresh && e && e.fileHash === fileHashes.get(path) && e.skillHash === sh) cached.push(path);
      else pending.push(path);
    }
    plan[skill] = { model, skillHash: sh, cached, pending, chunks: chunk(pending, chunkSize) };
  }
  return plan;
}

/**
 * Stores reviewer results. `results.reviewed` = {skill: [files the reviewer
 * covered]}; `results.findings` = verified findings. A reviewed file with no
 * findings is stored as an empty list — that is what makes it a cache hit.
 * Findings on files outside the change set are returned as `dropped`.
 */
export function storeResults(state, cache, results) {
  const fileHashes = new Map(state.files.map((f) => [f.path, f.fileHash]));
  const dropped = [];
  const now = new Date().toISOString();
  for (const [skill, files] of Object.entries(results.reviewed ?? {})) {
    const sh = skillHash(state.root, skill);
    for (const path of files) {
      if (!fileHashes.has(path)) continue;
      cache.entries[key(skill, path)] = { fileHash: fileHashes.get(path), skillHash: sh, findings: [], at: now };
    }
  }
  for (const f of results.findings ?? []) {
    const e = cache.entries[key(f.skill, f.file)];
    if (!e || !fileHashes.has(f.file) || !(results.reviewed?.[f.skill] ?? []).includes(f.file)) {
      dropped.push(f);
      continue;
    }
    e.findings.push(f);
  }
  return { dropped };
}

/** All cached findings for the selected skills, plus pairs that were never reviewed. */
export function cachedFindings(state, cache, skills) {
  const fileHashes = new Map(state.files.map((f) => [f.path, f.fileHash]));
  const findings = [];
  const missing = [];
  for (const skill of skills) {
    const sh = skillHash(state.root, skill);
    for (const path of state.bySkill[skill]?.files ?? []) {
      const e = cache.entries[key(skill, path)];
      if (e && e.fileHash === fileHashes.get(path) && e.skillHash === sh) findings.push(...e.findings);
      else missing.push({ skill, file: path });
    }
  }
  return { findings, missing };
}

/** Drops entries for files no longer in the change set. */
export function pruneCache(state, cache) {
  const paths = new Set(state.files.map((f) => f.path));
  for (const k of Object.keys(cache.entries)) {
    if (!paths.has(k.split('\u0000')[1])) delete cache.entries[k];
  }
}

export function parseSkillArgs(argv) {
  const skillsArg = argv.find((a) => a.startsWith('--skills='));
  return {
    quick: argv.includes('--quick'),
    skills: skillsArg ? skillsArg.slice('--skills='.length).split(',').map((s) => s.trim()).filter(Boolean) : null,
  };
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd !== 'plan') throw new Error('usage: cache.mjs plan [--fresh] [--quick | --skills=a,b]');
    const state = collectDiffState();
    const cache = loadCache(state.root);
    const skills = selectSkills(state, parseSkillArgs(rest));
    const plan = planReview(state, cache, { fresh: rest.includes('--fresh'), skills });
    const totals = Object.values(plan).reduce(
      (t, p) => ({ agents: t.agents + p.chunks.length, pending: t.pending + p.pending.length, cached: t.cached + p.cached.length }),
      { agents: 0, pending: 0, cached: 0 },
    );
    const out = { hash: state.hash, base: state.base, unrouted: state.unrouted, missing: state.missing, totals, plan };
    mkdirSync(stateDir(state.root), { recursive: true });
    writeFileSync(join(stateDir(state.root), 'plan.json'), JSON.stringify(out, null, 2));
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } catch (err) {
    process.stderr.write(`cache: ${err.message}\n`);
    process.exit(2);
  }
}
