#!/usr/bin/env node
// Collects everything that would land in a PR opened from the current branch:
// commits since merge-base(origin/main) + staged + unstaged + untracked files.
// Routes each changed file to the review skills in ../routing.json and computes
// a content hash that the PreToolUse gate (.claude/hooks/pr-gate.mjs) compares
// against the last verdict. No LLM here — this must stay deterministic.
//
//   node .claude/skills/pr-self-review/scripts/diff-state.mjs --json

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const STATE_DIR_REL = '.claude/pr-self-review';
export const PACKAGES = ['server', 'client', 'reviewer-core', 'e2e'];

const MAX_BUFFER = 512 * 1024 * 1024;

export function git(root, args, encoding = 'utf8') {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: root,
    encoding,
    maxBuffer: MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function repoRoot(cwd = process.cwd()) {
  return git(cwd, ['rev-parse', '--show-toplevel']).trim();
}

export function stateDir(root) {
  return join(root, STATE_DIR_REL);
}

export function mergeBase(root) {
  for (const ref of ['origin/main', 'main']) {
    try {
      return { ref, sha: git(root, ['merge-base', 'HEAD', ref]).trim() };
    } catch {
      // try the next candidate
    }
  }
  throw new Error('no merge-base with origin/main or main — fetch origin first');
}

export function sha256(...parts) {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex');
}

// ---------------------------------------------------------------- globbing

function escapeRe(s) {
  return s.replace(/[.+^$()|[\]\\]/g, '\\$&');
}

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) throw new Error(`unbalanced { in glob: ${glob}`);
      re += '(?:' + glob.slice(i + 1, end).split(',').map(escapeRe).join('|') + ')';
      i = end;
    } else {
      re += escapeRe(c);
    }
  }
  return new RegExp('^' + re + '$');
}

const globCache = new Map();
export function matchesAny(path, globs = []) {
  return globs.some((g) => {
    let re = globCache.get(g);
    if (!re) globCache.set(g, (re = globToRegExp(g)));
    return re.test(path);
  });
}

// ---------------------------------------------------------------- routing

export function loadRouting(skillDir = SKILL_DIR) {
  return JSON.parse(readFileSync(join(skillDir, 'routing.json'), 'utf8'));
}

/**
 * Skills a single changed file is routed to. `content` is the file's current
 * text: a `contentTrigger` looks at the whole file, not just added lines, so a
 * modified file that already had `'use client'` / a zod import still routes.
 */
export function routeFile(path, routing, content = '') {
  if (matchesAny(path, routing.exclude)) return [];
  const skills = [];
  for (const [name, cfg] of Object.entries(routing.skills)) {
    if (matchesAny(path, cfg.exclude)) continue;
    if (matchesAny(path, cfg.include)) {
      skills.push(name);
    } else if (
      cfg.contentTrigger &&
      matchesAny(path, cfg.contentInclude) &&
      new RegExp(cfg.contentTrigger).test(content)
    ) {
      skills.push(name);
    }
  }
  return skills;
}

/** Skill directories on disk vs. routing.json: which are unrouted / missing. */
export function discoverSkills(root, routing) {
  const dir = join(root, '.claude/skills');
  const onDisk = existsSync(dir)
    ? readdirSync(dir).filter((d) => existsSync(join(dir, d, 'SKILL.md')))
    : [];
  const known = new Set([...Object.keys(routing.skills), ...routing.nonReview]);
  return {
    unrouted: onDisk.filter((s) => !known.has(s)).sort(),
    missing: Object.keys(routing.skills).filter((s) => !onDisk.includes(s)).sort(),
  };
}

// ---------------------------------------------------------------- git state

function splitZ(out) {
  return out.split('\0').filter(Boolean);
}

/** `git diff --name-status -z <base>` → [{status, path, oldPath?}] (working tree vs base). */
export function changedTracked(root, base) {
  const parts = splitZ(git(root, ['diff', '--name-status', '-z', '--find-renames', base]));
  const files = [];
  for (let i = 0; i < parts.length; ) {
    const code = parts[i++];
    const status = code[0];
    if (status === 'R' || status === 'C') {
      const oldPath = parts[i++];
      files.push({ status, oldPath, path: parts[i++] });
    } else {
      files.push({ status, path: parts[i++] });
    }
  }
  return files;
}

export function untrackedFiles(root) {
  return splitZ(git(root, ['ls-files', '-o', '--exclude-standard', '-z'])).sort();
}

function unquote(p) {
  return p.startsWith('"') && p.endsWith('"') ? JSON.parse(p) : p;
}

/** Parses a `git diff -U0` into Map<path, [{line, text}]> of added lines. */
export function parseAddedLines(diffText) {
  const added = new Map();
  let path = null;
  let inHeader = false;
  let newLine = 0;
  for (const raw of diffText.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.startsWith('diff --git ')) {
      inHeader = true;
      path = null;
      continue;
    }
    if (inHeader && !line.startsWith('@@')) {
      if (line.startsWith('+++ ')) {
        // git appends a TAB to the header when the path contains a space
        const p = unquote(line.slice(4).replace(/\t$/, ''));
        path = p === '/dev/null' ? null : p.replace(/^b\//, '');
        if (path && !added.has(path)) added.set(path, []);
      }
      continue;
    }
    if (line.startsWith('@@')) {
      inHeader = false;
      const m = /\+(\d+)/.exec(line);
      newLine = m ? Number(m[1]) : 0;
      continue;
    }
    if (!path) continue;
    if (line.startsWith('+')) {
      added.get(path).push({ line: newLine, text: line.slice(1) });
      newLine++;
    } else if (line.startsWith(' ')) {
      newLine++;
    }
  }
  return added;
}

const MAX_TEXT_BYTES = 1024 * 1024;

function readText(abs) {
  try {
    if (statSync(abs).size > MAX_TEXT_BYTES) return null;
    const buf = readFileSync(abs);
    return buf.includes(0) ? null : buf.toString('utf8');
  } catch {
    return null;
  }
}

export function fileHash(root, path) {
  const abs = join(root, path);
  return existsSync(abs) ? sha256(readFileSync(abs)) : 'deleted';
}

/**
 * Content hash of the whole PR-bound change set: the base plus every changed
 * path with the hash of its current content. Deliberately not the diff text —
 * an untracked file and the same file committed render differently in
 * `git diff`, and committing reviewed work must keep the verdict valid.
 */
export function computeHash(root, base = mergeBase(root).sha) {
  const paths = new Set([
    ...splitZ(git(root, ['diff', '--name-only', '-z', '--no-renames', base])),
    ...untrackedFiles(root),
  ]);
  const h = createHash('sha256');
  h.update(base);
  for (const p of [...paths].sort()) h.update(`\0${p}\0${fileHash(root, p)}`);
  return h.digest('hex');
}

/** Full state. `added` (Map path → added lines) is attached non-enumerably. */
export function collectDiffState(root = repoRoot(), routing = loadRouting()) {
  const base = mergeBase(root);
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const added = parseAddedLines(git(root, ['diff', '-U0', '--no-color', '--no-ext-diff', '--find-renames', base.sha]));

  const entries = changedTracked(root, base.sha);
  for (const path of untrackedFiles(root)) {
    entries.push({ status: 'A', untracked: true, path });
    const text = readText(join(root, path));
    const lines = text === null ? [] : text.replace(/\r?\n$/, '').split(/\r?\n/);
    added.set(path, lines.map((t, i) => ({ line: i + 1, text: t })));
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));

  const bySkill = {};
  const files = entries.map((e) => {
    const skills = e.status === 'D' ? [] : routeFile(e.path, routing, readText(join(root, e.path)) ?? '');
    for (const s of skills) {
      bySkill[s] ??= { model: routing.skills[s].model ?? 'inherit', chunkSize: routing.skills[s].chunkSize ?? 15, files: [] };
      bySkill[s].files.push(e.path);
    }
    return { ...e, fileHash: fileHash(root, e.path), skills };
  });

  const packages = PACKAGES.filter((p) => files.some((f) => f.path.startsWith(p + '/') || f.oldPath?.startsWith(p + '/')));
  const state = {
    root,
    base,
    head,
    hash: computeHash(root, base.sha),
    packages,
    files,
    bySkill,
    ...discoverSkills(root, routing),
  };
  Object.defineProperty(state, 'added', { value: added, enumerable: false });
  return state;
}

// ---------------------------------------------------------------- CLI

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  try {
    const state = collectDiffState();
    if (process.argv.includes('--hash')) {
      process.stdout.write(state.hash + '\n');
    } else if (process.argv.includes('--json')) {
      process.stdout.write(JSON.stringify(state, null, 2) + '\n');
    } else {
      const lines = [
        `base ${state.base.ref} ${state.base.sha.slice(0, 8)} · head ${state.head.slice(0, 8)} · hash ${state.hash.slice(0, 12)}`,
        `${state.files.length} changed file(s) in: ${state.packages.join(', ') || '(no package)'}`,
        ...Object.entries(state.bySkill).map(([s, v]) => `  ${s.padEnd(26)} ${String(v.files.length).padStart(4)} file(s)  model=${v.model}`),
      ];
      if (state.unrouted.length) lines.push(`UNROUTED skills (add to routing.json or nonReview): ${state.unrouted.join(', ')}`);
      if (state.missing.length) lines.push(`routing.json names skills that do not exist: ${state.missing.join(', ')}`);
      process.stdout.write(lines.join('\n') + '\n');
    }
  } catch (err) {
    process.stderr.write(`diff-state: ${err.message}\n`);
    process.exit(2);
  }
}
