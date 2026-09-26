import { unzipSync } from 'fflate';
import type { Skill, SkillStats, SkillType, SkillVersion } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { DEFAULT_IMPORTED_SKILL_DESCRIPTION, DEFAULT_IMPORTED_SKILL_TYPE, MAX_IMPORT_BYTES } from './constants.js';
import type { SkillEntity, SkillStatsEntity, SkillVersionEntity } from './types.js';

/**
 * Pure helpers for the skills module (ring 1) — entity → DTO mapping, the
 * body-version-bump rule, and the `.md`/`.zip` import parser. No I/O beyond
 * decoding the bytes already handed to us (no filesystem, no process spawn).
 */

/** Map a skill entity to the public `Skill` DTO. */
export function toSkillDto(row: SkillEntity): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    source: row.source,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionEntity): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/** Map an aggregated stats entity to the public `SkillStats` DTO. */
export function toSkillStatsDto(stats: SkillStatsEntity): SkillStats {
  return {
    used_by: stats.usedBy,
    agents: stats.agents,
    accept_rate: stats.acceptRate,
    findings_30d: stats.findings30d,
    findings_by_category: stats.findingsByCategory,
  };
}

/**
 * True when a patch changes the body relative to the existing row — a body
 * change (and ONLY a body change) bumps the skill's version and snapshots
 * skill_versions. Unlike agents (where any config field bumps version),
 * skills version on body alone: name/description/type/enabled are metadata,
 * not the reproducible artifact an eval run scores against.
 */
export function isBodyChange(
  existing: Pick<SkillEntity, 'body'>,
  patch: { body?: string },
): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}

const VALID_SKILL_TYPES: readonly SkillType[] = ['rubric', 'convention', 'security', 'custom'];

function isSkillType(value: string): value is SkillType {
  return (VALID_SKILL_TYPES as readonly string[]).includes(value);
}

/**
 * Minimal inline frontmatter parser: `---\nkey: value\n---\n<body>`. Only flat
 * `key: value` pairs — no YAML nesting/lists/quoting — deliberately, so we
 * don't pull in a YAML parser for two fields. A file with no leading `---`
 * has no frontmatter; the whole text is the body.
 */
function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return { meta: {}, body: text };

  const meta: Record<string, string> = {};
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '---') {
      i++;
      break;
    }
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (match) meta[match[1]!.trim()] = match[2]!.trim();
  }
  return { meta, body: lines.slice(i).join('\n').replace(/^\n+/, '') };
}

/** Derive a name from the first `# Heading` line in the body, if any. */
function deriveNameFromHeading(body: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(body);
  return match?.[1]?.trim() || undefined;
}

/** Strip a known extension + normalize a filename into a fallback title. */
function nameFromFilename(filename: string): string {
  const base = filename.replace(/\.(md|markdown|zip)$/i, '');
  return base.replace(/[-_]+/g, ' ').trim() || 'Imported skill';
}

export interface ParsedSkillFile {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

/** Build a `ParsedSkillFile` from decoded frontmatter + body + a filename fallback. */
function fromFrontmatterText(filename: string, text: string): ParsedSkillFile {
  const { meta, body } = parseFrontmatter(text);
  const name = meta.name?.trim() || deriveNameFromHeading(body) || nameFromFilename(filename);
  const description = meta.description?.trim() || DEFAULT_IMPORTED_SKILL_DESCRIPTION;
  const trimmedType = meta.type?.trim();
  const type = trimmedType && isSkillType(trimmedType) ? trimmedType : DEFAULT_IMPORTED_SKILL_TYPE;
  return { name, description, type, body: body.trim() };
}

/**
 * Parse an imported skill file (`.md`/`.markdown`/`.zip`) into a
 * create-ready shape. Does NOT persist anything — the route/service returns
 * this as a preview.
 *
 * `.zip` is unzipped IN MEMORY (`fflate`'s `unzipSync`, pure JS, no child
 * process): only `SKILL.md` (or, failing that, the first `*.md` entry found
 * by iterating the zip's index) is ever read. Every other entry — scripts,
 * binaries, anything — is enumerated in the index but never extracted to
 * disk or executed; skills contribute text only.
 */
export function parseSkillFile(filename: string, bytes: Uint8Array): ParsedSkillFile {
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    throw new ValidationError(
      `Import file exceeds the ${Math.round(MAX_IMPORT_BYTES / 1024)}KB size cap`,
    );
  }

  if (/\.(md|markdown)$/i.test(filename)) {
    return fromFrontmatterText(filename, new TextDecoder('utf-8').decode(bytes));
  }

  if (/\.zip$/i.test(filename)) {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes);
    } catch {
      throw new ValidationError(`Could not read '${filename}' as a zip archive`);
    }
    const names = Object.keys(entries);
    const skillMdName =
      names.find((n) => n.toLowerCase() === 'skill.md') ||
      names.find((n) => n.toLowerCase().endsWith('/skill.md')) ||
      names.find((n) => n.toLowerCase().endsWith('.md'));
    if (!skillMdName) {
      throw new ValidationError(`No SKILL.md (or any .md file) found in '${filename}'`);
    }
    const text = new TextDecoder('utf-8').decode(entries[skillMdName]);
    return fromFrontmatterText(skillMdName, text);
  }

  throw new ValidationError(`Unsupported import file type: '${filename}' (expected .md or .zip)`);
}
