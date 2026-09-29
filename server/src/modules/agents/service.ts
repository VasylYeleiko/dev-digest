import type {
  Agent,
  AgentSkillLink,
  AgentVersion,
  CreateAgentRequest,
  LLMProviderResolver,
  ModelInfo,
  Provider,
  UpdateAgentRequest,
} from '@devdigest/shared';
import type { AgentStore } from './ports.js';
import { toAgentDto, toAgentVersionDto } from './helpers.js';
import { ValidationError } from '../../platform/errors.js';
import { scanSkill } from '../../platform/prompt-injection.js';

/**
 * A2 — agents service (ring 2). Business logic for the Agents tab + Agent Editor.
 * Provider/model selection uses the LLM adapter's dynamic model list.
 *
 * An Agent = provider + model + system_prompt + linked skills + output_schema +
 * enabled. Config changes are versioned via `agent_versions` (repository).
 */

/** The wire contracts ARE the service inputs — one definition, validated at the route. */
export type CreateAgentInput = CreateAgentRequest;
export type UpdateAgentInput = UpdateAgentRequest;

export interface AgentsServiceDeps {
  agents: AgentStore;
  llm: LLMProviderResolver;
}

export class AgentsService {
  constructor(private deps: AgentsServiceDeps) {}

  async list(workspaceId: string): Promise<Agent[]> {
    const rows = await this.deps.agents.list(workspaceId);
    const counts = await this.deps.agents.skillCounts(workspaceId, rows.map((r) => r.id));
    return rows.map((r) => toAgentDto(r, counts.get(r.id) ?? 0));
  }

  async get(workspaceId: string, id: string): Promise<Agent | undefined> {
    const row = await this.deps.agents.getById(workspaceId, id);
    return row ? toAgentDto(row) : undefined;
  }

  /** Delete an agent (and its versions/skill-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.deps.agents.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateAgentInput, userId?: string): Promise<Agent> {
    const row = await this.deps.agents.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      provider: input.provider,
      model: input.model,
      systemPrompt: input.system_prompt,
      outputSchema: input.output_schema,
      ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
      ...(input.ci_fail_on !== undefined ? { ciFailOn: input.ci_fail_on } : {}),
      ...(input.repo_intel !== undefined ? { repoIntel: input.repo_intel } : {}),
      enabled: input.enabled,
      createdBy: userId ?? null,
    });
    return toAgentDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgentInput,
  ): Promise<Agent | undefined> {
    const row = await this.deps.agents.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.system_prompt !== undefined ? { systemPrompt: patch.system_prompt } : {}),
      ...(patch.output_schema !== undefined ? { outputSchema: patch.output_schema } : {}),
      ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
      ...(patch.ci_fail_on !== undefined ? { ciFailOn: patch.ci_fail_on } : {}),
      ...(patch.repo_intel !== undefined ? { repoIntel: patch.repo_intel } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    return row ? toAgentDto(row) : undefined;
  }

  /**
   * Config history for an agent, newest version first. Workspace-scoped: returns
   * undefined when the agent isn't in this workspace (the route maps that to 404)
   * so version snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, agentId: string): Promise<AgentVersion[] | undefined> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.deps.agents.listVersions(agentId);
    return rows.map(toAgentVersionDto);
  }

  /**
   * A single config snapshot for an agent. Returns undefined when the agent isn't
   * in this workspace OR that version was never recorded (route → 404).
   */
  async getVersion(
    workspaceId: string,
    agentId: string,
    version: number,
  ): Promise<AgentVersion | undefined> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const row = await this.deps.agents.getVersion(agentId, version);
    return row ? toAgentVersionDto(row) : undefined;
  }

  /** Linked skills for an agent as AgentSkillLink[] (ordered). */
  /** The agent's ordered skill links, or undefined when it isn't in this workspace. */
  async skillLinks(workspaceId: string, agentId: string): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) return undefined;
    return this.linksOf(agentId);
  }

  /** Links of an agent whose workspace the caller has already checked. */
  private async linksOf(agentId: string): Promise<AgentSkillLink[]> {
    const links = await this.deps.agents.linkedSkills(agentId);
    return links.map((l) => ({ agent_id: agentId, skill_id: l.skillId, order: l.order }));
  }

  /**
   * Set / reorder the agent's linked skills. If `skillIds` is provided, replaces
   * the whole set in that order. Returns the resulting ordered links.
   *
   * A disabled skill (toggled off on the Skills page) can only appear here if
   * it was ALREADY linked — attaching a disabled skill for the first time is
   * rejected, so the UI can't attach what it also renders as unattachable.
   */
  async setSkills(
    workspaceId: string,
    agentId: string,
    skillIds: string[],
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const existing = await this.deps.agents.linkedSkills(agentId);
    const existingIds = new Set(existing.map((l) => l.skillId));
    const newlyAttached = skillIds.filter((id) => !existingIds.has(id));
    await this.rejectUnattachable(workspaceId, newlyAttached);
    await this.deps.agents.setSkills(agentId, skillIds);
    return this.linksOf(agentId);
  }

  /** Link a single skill (append or set order) — additive to existing links.
   *  Rejects a disabled skill unless it's already linked (see `setSkills`). */
  async linkSkill(
    workspaceId: string,
    agentId: string,
    skillId: string,
    order?: number,
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const existing = await this.deps.agents.linkedSkills(agentId);
    const alreadyLinked = existing.some((l) => l.skillId === skillId);
    if (!alreadyLinked) await this.rejectUnattachable(workspaceId, [skillId]);
    const resolvedOrder = order ?? existing.length;
    await this.deps.agents.linkSkill(agentId, skillId, resolvedOrder);
    return this.linksOf(agentId);
  }

  /**
   * Throws when any of `skillIds` is not a skill of this workspace, carries
   * prompt-injection patterns (it would go into this agent's system prompt as
   * trusted instructions) or is disabled.
   */
  private async rejectUnattachable(workspaceId: string, skillIds: string[]): Promise<void> {
    if (skillIds.length === 0) return;
    const skills = await this.deps.agents.skillAttachState(workspaceId, skillIds);
    const found = new Set(skills.map((s) => s.id));
    const unknown = skillIds.filter((id) => !found.has(id));
    if (unknown.length > 0) {
      throw new ValidationError('Unknown skill', { skill_ids: unknown });
    }
    const flagged = skills.filter((s) => scanSkill(s.name, s.body).detected).map((s) => s.id);
    if (flagged.length > 0) {
      throw new ValidationError('Cannot attach a skill that contains prompt-injection patterns', {
        skill_ids: flagged,
      });
    }
    const disabled = skills.filter((s) => !s.enabled).map((s) => s.id);
    if (disabled.length > 0) {
      throw new ValidationError('Cannot attach a disabled skill', { skill_ids: disabled });
    }
  }

  /**
   * Dynamic model list from the provider adapter's /models. Degrades gracefully
   * to [] if the provider key is not configured (the editor still renders).
   */
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    try {
      const llm = await this.deps.llm(provider);
      return await llm.listModels();
    } catch {
      return [];
    }
  }
}
