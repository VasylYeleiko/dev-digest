import { unzipSync } from 'fflate';
import type { Skill, SkillStats, SkillType, SkillVersion } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { scanSkill } from '../../platform/prompt-injection.js';
import {
  DEFAULT_IMPORTED_SKILL_DESCRIPTION,
  DEFAULT_IMPORTED_SKILL_TYPE,
  MAX_IMPORT_BYTES,
  MAX_UNZIPPED_SKILL_BYTES,
  URL_IMPORT_CONTENT_TYPES,
} from './constants.js';
import type { SkillEntity, SkillStatsEntity, SkillVersionEntity } from './types.js';

/**
 * Pure helpers for the skills module (ring 1) — entity → DTO mapping, the
 * body-version-bump rule, and the `.md`/`.zip` import parser. No I/O beyond
 * decoding the bytes already handed to us (no filesystem, no process spawn).
 */

/**
 * Map a skill entity to the public `Skill` DTO. `agentCount` (agents in the
 * workspace linking it) is included when the caller looked it up.
 */
export function toSkillDto(row: SkillEntity, agentCount?: number): Skill {
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
    injection: scanSkill(row.name, row.body),
    ...(agentCount !== undefined ? { agent_count: agentCount } : {}),
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
    // Two passes through fflate's `filter`: the first only lists entry names
    // (inflates nothing), the second inflates just the chosen .md — and only
    // when its declared size is under the cap (fflate never writes past the
    // declared size), so a zip bomb can't expand in memory.
    const names: string[] = [];
    let entries: Record<string, Uint8Array>;
    try {
      unzipSync(bytes, { filter: (f) => (names.push(f.name), false) });
      const skillMdName =
        names.find((n) => n.toLowerCase() === 'skill.md') ||
        names.find((n) => n.toLowerCase().endsWith('/skill.md')) ||
        names.find((n) => n.toLowerCase().endsWith('.md'));
      if (!skillMdName) {
        throw new ValidationError(`No SKILL.md (or any .md file) found in '${filename}'`);
      }
      entries = unzipSync(bytes, {
        filter: (f) => {
          if (f.name !== skillMdName) return false;
          if (f.originalSize > MAX_UNZIPPED_SKILL_BYTES) {
            throw new ValidationError(
              `'${skillMdName}' in '${filename}' exceeds the ${Math.round(MAX_UNZIPPED_SKILL_BYTES / 1024)}KB size cap`,
            );
          }
          return true;
        },
      });
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError(`Could not read '${filename}' as a zip archive`);
    }
    const [skillMdName, content] = Object.entries(entries)[0]!;
    return fromFrontmatterText(skillMdName, new TextDecoder('utf-8').decode(content));
  }

  throw new ValidationError(`Unsupported import file type: '${filename}' (expected .md or .zip)`);
}

/**
 * Map a GitHub *page* URL to the raw file it shows, so pasting the link from
 * the browser just works: `github.com/o/r/blob/<ref>/<path>` →
 * `raw.githubusercontent.com/o/r/<ref>/<path>`, and a gist page
 * `gist.github.com/<user>/<id>` → its `/raw` (first file). Anything else is
 * returned unchanged.
 */
export function toRawSkillUrl(url: URL): URL {
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'github.com' && parts[2] === 'blob' && parts.length >= 5) {
    const [owner, repo, , ...rest] = parts;
    return new URL(`https://raw.githubusercontent.com/${owner}/${repo}/${rest.join('/')}`);
  }
  if (url.hostname === 'gist.github.com' && parts.length === 2) {
    return new URL(`https://gist.github.com/${parts[0]}/${parts[1]}/raw`);
  }
  return url;
}

/**
 * The filename `parseSkillFile` should see for a fetched URL: its last path
 * segment when that is `.md`/`.markdown`/`.zip`, otherwise the name with `.md`
 * — a raw gist (`…/raw/<sha>/skill.txt`) or an extension-less link is text.
 */
export function importFilenameFromUrl(url: URL): string {
  const segment = url.pathname.split('/').filter(Boolean).pop() ?? '';
  let last: string;
  try {
    last = decodeURIComponent(segment);
  } catch {
    last = segment; // malformed %-escape (e.g. from a redirect target): use it raw, don't 500
  }
  if (/\.(md|markdown|zip)$/i.test(last)) return last;
  const base = last.replace(/\.[A-Za-z0-9]+$/, '');
  return `${base || 'imported-skill'}.md`;
}

/** Whether a response content type is one a skill file can come as. */
export function isImportableContentType(contentType: string | null): boolean {
  if (!contentType) return true; // absent → sniffing is left to the parser
  const mime = contentType.split(';')[0]!.trim().toLowerCase();
  return (URL_IMPORT_CONTENT_TYPES as readonly string[]).includes(mime);
}
