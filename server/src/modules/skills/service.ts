import type {
  CreateSkillRequest,
  Skill,
  SkillImportPreview,
  SkillStats,
  SkillVersion,
  UpdateSkillRequest,
} from '@devdigest/shared';
import type { SkillStore } from './ports.js';
import { parseSkillFile, toSkillDto, toSkillStatsDto, toSkillVersionDto } from './helpers.js';

/**
 * skills service (ring 2). Business logic for the Skills list + Skill editor.
 * A Skill = name + description ("directive interface") + type + body + source
 * + enabled. Body changes are versioned via `skill_versions` (repository).
 */

/** The wire contracts ARE the service inputs — one definition, validated at the route. */
export type CreateSkillInput = CreateSkillRequest;
export type UpdateSkillInput = UpdateSkillRequest;

export interface SkillsServiceDeps {
  skills: SkillStore;
}

export class SkillsService {
  constructor(private deps: SkillsServiceDeps) {}

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.deps.skills.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.deps.skills.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  /** Delete a skill (and its versions/agent-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.deps.skills.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.deps.skills.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      body: input.body,
      ...(input.source !== undefined ? { source: input.source } : {}),
      enabled: input.enabled,
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.deps.skills.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.source !== undefined ? { source: patch.source } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    return row ? toSkillDto(row) : undefined;
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
    return { ...parsed, source: 'extracted' };
  }
}
