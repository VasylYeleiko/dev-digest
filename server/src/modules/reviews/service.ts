import type {
  FindingActionKind,
  Logger,
  RunEvent,
  RunEventBus,
  RunEventKind,
  RunTrace,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { AgentEntity, AgentStore } from '../agents/index.js';
import type { PullStore } from '../pulls/index.js';
import type { RepoStore } from '../repos/index.js';
import type { ReviewStore } from './ports.js';
import { type ReviewDto, type ReviewDtoFinding, reviewToDto } from './helpers.js';
import type { ReviewRunExecutor } from './run-executor.js';
import { actOnFinding as actOnFindingImpl } from './findings.js';

export interface ReviewServiceDeps {
  reviews: ReviewStore;
  agents: Pick<AgentStore, 'getById' | 'list' | 'listEnabled'>;
  pulls: Pick<PullStore, 'getInWorkspace'>;
  repos: Pick<RepoStore, 'getById'>;
  runBus: RunEventBus;
  /** Background runner for queued agent runs (built in compose.ts). */
  executor: ReviewRunExecutor;
}

/**
 * Review service (the core). Orchestrates:
 *   diff → assemblePrompt(system + repo-map + diff)
 *        → llm.completeStructured({ schema: Review }) (single-pass)
 *        → groundFindings(...) (citation gate — drops findings off the diff)
 *        → persist reviews + kept findings (+ grounding summary)
 *   while streaming RunEvents over the run event bus, and on completion writing
 *   the whole log as ONE RunTrace doc + an agent_runs row.
 *
 * Also: the finding accept/dismiss actions. The bulky run execution lives in
 * run-executor; this class keeps the public method surface.
 */
export class ReviewService {
  constructor(private deps: ReviewServiceDeps) {}

  // ===========================================================================
  // Run a review for one or all enabled agents on a PR.
  // ===========================================================================

  /**
   * Resolve which agents to run. `agentIds` (hand-picked subset, checked
   * first) → those agents; `all` → all enabled agents; else a single agent.
   */
  async resolveTargets(
    workspaceId: string,
    opts: { agentId?: string; all?: boolean; agentIds?: string[] },
  ): Promise<AgentEntity[]> {
    if (opts.agentIds?.length) {
      const found = await Promise.all(opts.agentIds.map((id) => this.deps.agents.getById(workspaceId, id)));
      const missing = opts.agentIds.filter((_, i) => !found[i]);
      if (missing.length) throw new NotFoundError(`Agent(s) not found: ${missing.join(', ')}`);
      return found as AgentEntity[];
    }
    if (opts.all) return this.deps.agents.listEnabled(workspaceId);
    if (opts.agentId) {
      const agent = await this.deps.agents.getById(workspaceId, opts.agentId);
      if (!agent) throw new NotFoundError('Agent not found');
      return [agent];
    }
    throw new AppError('invalid_run_request', 'Provide agentId, agentIds, or all:true', 400);
  }

  /** Delete a whole review run (one agent's pass) + its findings (cascade). */
  async deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return this.deps.reviews.deleteReview(workspaceId, reviewId);
  }

  /** In-flight runs for a PR (server-side source of truth, survives reload). */
  async activeRuns(workspaceId: string, prId: string) {
    return this.deps.reviews.activeRunsForPull(workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the run history (incl. failures). */
  async listRuns(workspaceId: string, prId: string) {
    return this.deps.reviews.listRunsForPull(workspaceId, prId);
  }

  /** Delete one run from the history (+ its trace). */
  async deleteRun(workspaceId: string, runId: string): Promise<boolean> {
    return this.deps.reviews.deleteAgentRun(workspaceId, runId);
  }

  /**
   * Cancel an in-flight run. Signals a live runner to stop at its next
   * checkpoint AND marks the DB row cancelled + completes the bus immediately —
   * so cancel also works for ORPHANED runs (whose background process died on a
   * server restart) where signalling alone would do nothing.
   */
  async cancelRun(workspaceId: string, runId: string): Promise<boolean> {
    // Not a run of this workspace (or no such run) → nothing to cancel.
    if ((await this.deps.reviews.runStatus(workspaceId, runId)) === undefined) return false;
    this.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.deps.runBus.cancel(runId);
    await this.deps.reviews.cancelRunIfRunning(runId);
    this.deps.runBus.complete(runId);
    return true;
  }

  /** Reap runs left 'running' by a previous (now-dead) process. Called on boot. */
  async reapStaleRuns(): Promise<number> {
    return this.deps.reviews.reapStaleRunningRuns();
  }

  /**
   * Run a review for each target agent. Each agent gets its own runId
   * (= agent_runs.id) created up-front so the SSE route can be subscribed
   * before/while the run progresses. A partial failure in one agent does not
   * abort the others.
   */
  async runReview(
    workspaceId: string,
    prId: string,
    targets: AgentEntity[],
    logger?: Logger,
  ): Promise<{ runs: { run_id: string; agent_id: string; agent_name: string }[]; reviews: ReviewDto[] }> {
    const pull = await this.deps.pulls.getInWorkspace(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.deps.repos.getById(workspaceId, pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Create the agent_run rows up front so a runId is available IMMEDIATELY —
    // the client persists these in global state and subscribes to the SSE
    // stream. The actual (slow) review runs in the background below.
    const runs: { run_id: string; agent_id: string; agent_name: string }[] = [];
    const jobs: { agent: AgentEntity; runId: string }[] = [];
    for (const agent of targets) {
      const runId = await this.deps.reviews.createAgentRun({
        workspaceId,
        agentId: agent.id,
        prId,
        provider: agent.provider,
        model: agent.model,
      });
      runs.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
      jobs.push({ agent, runId });
    }

    // Fire-and-forget: the HTTP response returns now with the runIds; reviews
    // are persisted as each agent finishes and the client refetches on SSE done.
    void this.deps.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
      logger?.error({ prId, err: (err as Error).message }, 'review: background execution crashed');
    });

    return { runs, reviews: [] };
  }

  /**
   * Live events of one run as an async iterator: the replay buffer first, then
   * live events, ending when the run completes. Bridges the run event bus's
   * push callbacks to a pull-based stream the SSE route drains.
   */
  async *events(workspaceId: string, runId: string): AsyncGenerator<RunEvent> {
    // Only runs of the caller's workspace stream at all. Beyond that, a run this
    // process holds no state for can only still be live if the DB says it's
    // running (created here, no event published yet). Anything else — a run from
    // before a restart, an already-finished one whose buffer was evicted — would
    // otherwise wait for a `done` that never comes.
    const status = await this.deps.reviews.runStatus(workspaceId, runId);
    if (status === undefined) return;
    if (!this.deps.runBus.knows(runId) && status !== 'running') return;

    const queue: RunEvent[] = [];
    let wake: (() => void) | null = null;
    let done = false;

    const unsubscribe = this.deps.runBus.subscribe(runId, (e) => {
      queue.push(e);
      wake?.();
    });
    const offDone = this.deps.runBus.onDone(runId, () => {
      done = true;
      wake?.();
    });

    try {
      while (true) {
        if (queue.length === 0) {
          if (done) break;
          await new Promise<void>((r) => (wake = r));
          wake = null;
          continue;
        }
        yield queue.shift()!;
      }
    } finally {
      unsubscribe();
      offDone();
    }
  }

  private publish(runId: string, kind: RunEventKind, msg: string, data?: unknown) {
    return this.deps.runBus.publish(runId, kind, msg, data);
  }

  // ===========================================================================
  // Finding actions
  // ===========================================================================

  async actOnFinding(
    workspaceId: string,
    findingId: string,
    action: FindingActionKind,
  ): Promise<{ finding: ReviewDtoFinding }> {
    return actOnFindingImpl(this.deps.reviews, workspaceId, findingId, action);
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async reviewsForPull(workspaceId: string, prId: string): Promise<ReviewDto[]> {
    const pull = await this.deps.pulls.getInWorkspace(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rows = await this.deps.reviews.reviewsForPull(prId);
    // One query for the workspace's agents (a handful) instead of one per
    // reviewing agent; `list` (not `listEnabled`) so disabled agents keep their name.
    const names = new Map<string, string>();
    if (rows.some(({ review }) => review.agentId)) {
      for (const a of await this.deps.agents.list(workspaceId)) names.set(a.id, a.name);
    }
    return rows.map(({ review, findings }) =>
      reviewToDto(review, findings, review.agentId ? names.get(review.agentId) : null),
    );
  }

  async getRunTrace(workspaceId: string, runId: string): Promise<RunTrace | undefined> {
    if ((await this.deps.reviews.runStatus(workspaceId, runId)) === undefined) return undefined;
    return this.deps.reviews.getRunTrace(runId);
  }
}
