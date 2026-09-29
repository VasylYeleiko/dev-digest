import type {
  CreateSkillRequest,
  Skill,
  HttpFetcher,
  SkillImportPreview,
  SkillStats,
  SkillVersion,
  UpdateSkillRequest,
} from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { scanSkill } from '../../platform/prompt-injection.js';
import { assertFetchableUrl } from '../../platform/url-safety.js';
import { MAX_IMPORT_BYTES, URL_IMPORT_MAX_REDIRECTS, URL_IMPORT_TIMEOUT_MS } from './constants.js';
import type { SkillStore } from './ports.js';
import {
  importFilenameFromUrl,
  isImportableContentType,
  parseSkillFile,
  toRawSkillUrl,
  toSkillDto,
  toSkillStatsDto,
  toSkillVersionDto,
} from './helpers.js';

/**
 * skills service (ring 2). Business logic for the Skills list + Skill editor.
 * A Skill = name + description ("directive interface") + type + body + source
 * + enabled. Body changes are versioned via `skill_versions` (repository).
 */

/**
 * The wire contracts ARE the service inputs — one definition, validated at the
 * route. `evidenceFiles` is server-set only (e.g. by the Conventions extractor),
 * never accepted from a request body.
 */
export type CreateSkillInput = CreateSkillRequest & { evidenceFiles?: string[] | null };
export type UpdateSkillInput = UpdateSkillRequest & { evidenceFiles?: string[] | null };

export interface SkillsServiceDeps {
  skills: SkillStore;
  /** SSRF-guarded outbound GET — only `importFromUrl` uses it. */
  http: HttpFetcher;
}

export class SkillsService {
  constructor(private deps: SkillsServiceDeps) {}

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.deps.skills.list(workspaceId);
    const counts = await this.deps.skills.agentCounts(workspaceId, rows.map((r) => r.id));
    return rows.map((r) => toSkillDto(r, counts.get(r.id) ?? 0));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.deps.skills.getById(workspaceId, id);
    return row ? toSkillDto(row, await this.agentCount(workspaceId, id)) : undefined;
  }

  private async agentCount(workspaceId: string, id: string): Promise<number> {
    return (await this.deps.skills.agentCounts(workspaceId, [id])).get(id) ?? 0;
  }

  async findByName(workspaceId: string, name: string): Promise<Skill | undefined> {
    const row = await this.deps.skills.findByName(workspaceId, name);
    return row ? toSkillDto(row) : undefined;
  }

  /** Delete a skill (and its versions/agent-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.deps.skills.deleteById(workspaceId, id);
  }

  /**
   * A skill whose name or body has prompt-injection patterns is still SAVED (so it can be seen,
   * reviewed and fixed) but always lands disabled — see `platform/prompt-injection.ts`.
   */
  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const flagged = scanSkill(input.name, input.body).detected;
    const row = await this.deps.skills.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      body: input.body,
      ...(input.source !== undefined ? { source: input.source } : {}),
      enabled: flagged ? false : input.enabled,
      ...(input.evidenceFiles !== undefined ? { evidenceFiles: input.evidenceFiles } : {}),
    });
    return toSkillDto(row, 0);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const existing = await this.deps.skills.getById(workspaceId, id);
    if (!existing) return undefined;
    // Vet the name + body the skill will have AFTER this patch. Turning a flagged
    // skill ON is refused; any other save of a flagged body (pasting one into
    // an enabled skill, a mid-fix save) goes through but forces the skill off,
    // so an injection can never be live in a prompt.
    const report = scanSkill(patch.name ?? existing.name, patch.body ?? existing.body);
    if (report.detected && patch.enabled === true && !existing.enabled) {
      throw new ValidationError('This skill contains prompt-injection patterns — fix its name or body before enabling it', {
        injection: report.findings,
      });
    }
    const enabled = report.detected ? false : patch.enabled;
    const row = await this.deps.skills.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.source !== undefined ? { source: patch.source } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(patch.evidenceFiles !== undefined ? { evidenceFiles: patch.evidenceFiles } : {}),
    });
    return row ? toSkillDto(row, await this.agentCount(workspaceId, id)) : undefined;
  }

  /**
   * Body-version history for a skill, newest version first. Workspace-scoped:
   * returns undefined when the skill isn't in this workspace (the route maps
   * that to 404) so version snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.deps.skills.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.deps.skills.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  /**
   * A single body snapshot for a skill. Returns undefined when the skill isn't
   * in this workspace OR that version was never recorded (route → 404).
   */
  async getVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    const skill = await this.deps.skills.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const row = await this.deps.skills.getVersion(skillId, version);
    return row ? toSkillVersionDto(row) : undefined;
  }

  /**
   * Stats-tab data for a skill. Workspace-scoped: returns undefined when the
   * skill isn't in this workspace (route → 404).
   */
  async stats(workspaceId: string, skillId: string): Promise<SkillStats | undefined> {
    const skill = await this.deps.skills.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const stats = await this.deps.skills.statsForSkill(workspaceId, skillId);
    return toSkillStatsDto(stats);
  }

  /**
   * Parse an uploaded `.md`/`.zip` skill file into a preview — persists
   * NOTHING. The client shows this and, on confirm, calls `create` with
   * `source: 'extracted'`.
   */
  importPreview(filename: string, contentBase64: string): SkillImportPreview {
    const bytes = Buffer.from(contentBase64, 'base64');
    const parsed = parseSkillFile(filename, bytes);
    return { ...parsed, source: 'extracted', injection: scanSkill(parsed.name, parsed.body) };
  }

  /**
   * Fetch a skill file from a URL (server-side, SSRF-guarded) into a preview —
   * persists NOTHING, exactly like `importPreview`. The client shows it with
   * its injection report and, on confirm, creates the skill with
   * `source: 'imported_url'` (disabled until vetted).
   */
  async importFromUrl(rawUrl: string): Promise<SkillImportPreview> {
    const url = toRawSkillUrl(assertFetchableUrl(rawUrl.trim()));
    const res = await this.deps.http.fetch(url.toString(), {
      maxBytes: MAX_IMPORT_BYTES,
      timeoutMs: URL_IMPORT_TIMEOUT_MS,
      maxRedirects: URL_IMPORT_MAX_REDIRECTS,
    });
    if (res.status >= 400) throw new ValidationError(`The URL answered HTTP ${res.status} — check that it is public and correct`);
    if (!isImportableContentType(res.contentType)) {
      throw new ValidationError(
        `The URL returned ${res.contentType?.split(';')[0] ?? 'an unsupported type'}, not a skill file — use the raw file link`,
      );
    }
    const parsed = parseSkillFile(importFilenameFromUrl(new URL(res.url)), res.body);
    return { ...parsed, source: 'imported_url', injection: scanSkill(parsed.name, parsed.body) };
  }
}
