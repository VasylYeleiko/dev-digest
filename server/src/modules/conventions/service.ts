import type {
  Convention,
  ConventionSkillDraft,
  ConventionsResponse,
  CreateConventionsSkillRequest,
  CreateConventionsSkillResult,
  LLMProvider,
  LLMProviderResolver,
  UpdateConventionRequest,
} from '@devdigest/shared';
import {
  AppError,
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../../platform/errors.js';
import { scanSkill } from '../../platform/prompt-injection.js';
import type { RepoEntity } from '../repos/index.js';
import {
  EXTRACTION_MAX_RETRIES,
  EXTRACTION_SCHEMA_NAME,
  EXTRACTION_TEMPERATURE,
  EXTRACTION_TIMEOUT_MS,
  DEFAULT_SKILL_NAME,
  MAX_CANDIDATES,
  MAX_CONFIG_FILES,
  SAMPLE_POOL_FILES,
  SAMPLE_SOURCE_FILES,
} from './constants.js';
import { gateCandidates, toConventionDto, toConventionScanDto } from './helpers.js';
import { ConventionExtraction } from './llm-schema.js';
import type {
  ConventionAgentLinker,
  ConventionFileReader,
  ConventionRepoLookup,
  ConventionSampler,
  ConventionSkillWriter,
  ConventionStore,
  FeatureModelResolver,
  SystemPromptLoader,
} from './ports.js';
import {
  configCandidates,
  packageRootsOf,
  renderSampledFile,
  renderUserMessage,
  stratifySample,
  truncateForPrompt,
} from './sampling.js';
import { buildSkillBody, draftDescription, evidenceFilesOf } from './skill-body.js';
import type { ConventionEntity, SampledFile } from './types.js';

/**
 * conventions service (ring 2). Three stages, and only the middle one is a model:
 *   SAMPLE   configs + `getConventionSamples()` read from the clone — pure code
 *   PROPOSE  one structured call on the workspace's `conventions` feature model
 *   VERIFY   the evidence gate re-finds every cited snippet in the sampled text
 * Survivors replace the repo's `pending` rows; accepted/rejected rows are never
 * touched by a re-scan and never re-proposed.
 */

export interface ConventionsServiceDeps {
  conventions: ConventionStore;
  repos: ConventionRepoLookup;
  sampler: ConventionSampler;
  files: ConventionFileReader;
  llm: LLMProviderResolver;
  featureModel: FeatureModelResolver;
  systemPrompt: SystemPromptLoader;
  skills: ConventionSkillWriter;
  agents: ConventionAgentLinker;
}

interface Sample {
  files: SampledFile[];
  /** path → exactly the (truncated) text the model saw — the gate's ground truth. */
  texts: Map<string, string>;
  rendered: string[];
}

export class ConventionsService {
  constructor(private deps: ConventionsServiceDeps) {}

  async list(workspaceId: string, repoId: string): Promise<ConventionsResponse> {
    await this.requireRepo(workspaceId, repoId);
    const [scan, rows] = await Promise.all([
      this.deps.conventions.latestScan(workspaceId, repoId),
      this.deps.conventions.listVisible(workspaceId, repoId),
    ]);
    return { scan: scan ? toConventionScanDto(scan) : null, items: rows.map(toConventionDto) };
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionsResponse> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) {
      throw new ConflictError('Repository is not cloned yet — wait for the clone to finish, then scan.');
    }

    const sample = await this.sample(repoId, repo.clonePath);
    if (!sample.files.some((f) => f.kind === 'source')) {
      throw new ConflictError('Repository is not indexed yet — run a resync, then scan.');
    }

    const choice = await this.deps.featureModel(workspaceId);
    const llm = await this.deps.llm(choice.provider);
    const reply = await this.propose(llm, choice.model, repo.fullName, sample);

    const candidates = reply.data.conventions.slice(0, MAX_CANDIDATES);
    const triaged = await this.deps.conventions.triagedRules(workspaceId, repoId);
    const gate = gateCandidates(candidates, sample.texts, triaged);

    await this.deps.conventions.replacePending(workspaceId, repoId, gate.rows, {
      provider: choice.provider,
      model: reply.model,
      sampleFiles: sample.files.map((f) => f.path),
      proposed: reply.data.conventions.length,
      dropped: gate.dropped,
      skipped: gate.skipped,
      costUsd: reply.costUsd,
    });
    return this.list(workspaceId, repoId);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConventionRequest,
  ): Promise<Convention | undefined> {
    const row = await this.deps.conventions.update(workspaceId, id, {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
    });
    return row ? toConventionDto(row) : undefined;
  }

  /**
   * Pre-filled, editable skill merged from accepted conventions. Persists
   * nothing; `existing_skill_id` tells the UI that Create will save a new
   * version of an existing skill rather than a second one.
   */
  async skillDraft(
    workspaceId: string,
    repoId: string,
    conventionIds: string[],
  ): Promise<ConventionSkillDraft> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const rows = await this.requireAccepted(workspaceId, repoId, conventionIds);
    const existing = await this.deps.skills.findByName(workspaceId, DEFAULT_SKILL_NAME);
    return {
      name: DEFAULT_SKILL_NAME,
      description: draftDescription(rows.length, repo.fullName),
      type: 'convention',
      body: buildSkillBody(DEFAULT_SKILL_NAME, repo.fullName, rows),
      convention_ids: rows.map((r) => r.id),
      existing_skill_id: existing?.id ?? null,
    };
  }

  /**
   * Save the (edited) draft as a skill — a new one, or a new version of the
   * skill with that name — then link it to the chosen agents. Everything that
   * can be refused is checked BEFORE the skill is written, so a bad agent id
   * never leaves a half-done skill behind.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    req: CreateConventionsSkillRequest,
  ): Promise<CreateConventionsSkillResult> {
    await this.requireRepo(workspaceId, repoId);
    const rows = await this.requireAccepted(workspaceId, repoId, req.convention_ids);
    const agentIds = [...new Set(req.agent_ids)];
    await this.requireAgents(workspaceId, agentIds);
    if (!req.enabled && agentIds.length > 0) {
      throw new ValidationError('Enable the skill to link it to agents — a disabled skill cannot be attached.');
    }
    // Evidence snippets are repo code — untrusted. Refuse up front rather than
    // save a skill the skills module would force off and agents would refuse.
    const injection = scanSkill(req.name, req.body);
    if (injection.detected) {
      throw new ValidationError(
        'The skill name or body contains prompt-injection patterns — remove them before saving',
        { injection: injection.findings },
      );
    }

    const write = {
      name: req.name,
      description: req.description,
      type: req.type,
      body: req.body,
      enabled: req.enabled,
      evidenceFiles: evidenceFilesOf(rows),
    };
    const existing = await this.deps.skills.findByName(workspaceId, req.name);
    const skill = existing
      ? await this.deps.skills.update(workspaceId, existing.id, write)
      : await this.deps.skills.create(workspaceId, { ...write, source: 'extracted' });
    if (!skill) throw new NotFoundError('Skill not found');

    for (const agentId of agentIds) {
      const links = (await this.deps.agents.skillLinks(workspaceId, agentId)) ?? [];
      // Re-linking would move an already-attached skill to the end of the
      // agent's prompt order — keep the order the user arranged.
      if (links.some((l) => l.skill_id === skill.id)) continue;
      await this.deps.agents.linkSkill(workspaceId, agentId, skill.id);
    }
    return { skill, created: !existing, linked_agent_ids: agentIds };
  }

  /** All `ids` must be accepted conventions of this repo (422 lists the rest). */
  private async requireAccepted(
    workspaceId: string,
    repoId: string,
    ids: string[],
  ): Promise<ConventionEntity[]> {
    const unique = [...new Set(ids)];
    const rows = await this.deps.conventions.acceptedByIds(workspaceId, repoId, unique);
    if (rows.length !== unique.length) {
      const found = new Set(rows.map((r) => r.id));
      throw new ValidationError('Only accepted conventions of this repo can be merged into a skill', {
        convention_ids: unique.filter((id) => !found.has(id)),
      });
    }
    return rows;
  }

  private async requireAgents(workspaceId: string, agentIds: string[]): Promise<void> {
    const agents = await Promise.all(agentIds.map((id) => this.deps.agents.get(workspaceId, id)));
    const missing = agentIds.filter((_, i) => !agents[i]);
    if (missing.length > 0) throw new ValidationError('Unknown agent', { agent_ids: missing });
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoEntity> {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  /** SAMPLE: config files at each package root + top-ranked source files spread across packages. */
  private async sample(repoId: string, root: string): Promise<Sample> {
    const pool = await this.deps.sampler.getConventionSamples(repoId, SAMPLE_POOL_FILES);
    const sourcePaths = stratifySample(pool, SAMPLE_SOURCE_FILES);
    const configPaths = configCandidates(packageRootsOf(sourcePaths));

    const [configTexts, sourceTexts] = await Promise.all([
      Promise.all(configPaths.map((p) => this.deps.files.read(root, p))),
      Promise.all(sourcePaths.map((p) => this.deps.files.read(root, p))),
    ]);

    const files: SampledFile[] = [];
    const truncatedFlags: boolean[] = [];
    const add = (path: string, kind: SampledFile['kind'], raw: string | null) => {
      if (raw === null || raw.trim().length === 0) return;
      const { text, truncated } = truncateForPrompt(raw);
      files.push({ path, kind, content: text });
      truncatedFlags.push(truncated);
    };
    configPaths.forEach((p, i) => {
      if (files.length < MAX_CONFIG_FILES) add(p, 'config', configTexts[i] ?? null);
    });
    sourcePaths.forEach((p, i) => add(p, 'source', sourceTexts[i] ?? null));

    return {
      files,
      texts: new Map(files.map((f) => [f.path, f.content])),
      rendered: files.map((f, i) => renderSampledFile(f, truncatedFlags[i] ?? false)),
    };
  }

  /** PROPOSE: one structured call. Provider failures surface as a 502, config errors as-is. */
  private async propose(
    llm: LLMProvider,
    model: string,
    repoName: string,
    sample: Sample,
  ) {
    try {
      return await llm.completeStructured({
        model,
        schema: ConventionExtraction,
        schemaName: EXTRACTION_SCHEMA_NAME,
        messages: [
          { role: 'system', content: await this.deps.systemPrompt() },
          { role: 'user', content: renderUserMessage(repoName, sample.rendered) },
        ],
        temperature: EXTRACTION_TEMPERATURE,
        maxRetries: EXTRACTION_MAX_RETRIES,
        timeoutMs: EXTRACTION_TIMEOUT_MS,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError(
        `Convention extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
