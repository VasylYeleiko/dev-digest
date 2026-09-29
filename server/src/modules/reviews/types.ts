/**
 * reviews — domain types (ring 1). Plain camelCase shapes; the repository
 * maps rows into these, helpers.ts maps them to the `ReviewDto` wire shape.
 */

/** One agent's review pass over a PR. */
export interface ReviewEntity {
  id: string;
  workspaceId: string;
  prId: string;
  agentId: string | null;
  /** The agent_run that produced this review (links the timeline run ↔ review). */
  runId: string | null;
  kind: 'summary' | 'review';
  verdict: string | null;
  summary: string | null;
  score: number | null;
  model: string | null;
  createdAt: Date;
}

/** One grounded finding of a review, plus the reviewer's accept/dismiss decision. */
export interface FindingEntity {
  id: string;
  reviewId: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: string;
  category: string;
  title: string;
  rationale: string;
  suggestion: string | null;
  confidence: number;
  kind: string;
  trifectaComponents: string[] | null;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

export interface ReviewWithFindings {
  review: ReviewEntity;
  findings: FindingEntity[];
}

export interface NewReview {
  workspaceId: string;
  prId: string;
  agentId: string | null;
  runId: string | null;
  kind: 'summary' | 'review';
  verdict: string | null;
  summary: string | null;
  score: number | null;
  model: string | null;
}

export interface NewAgentRun {
  workspaceId: string;
  agentId: string | null;
  prId: string;
  provider: string | null;
  model: string | null;
}

/** The final state of an agent run (done / failed / cancelled). */
export interface AgentRunCompletion {
  status: 'done' | 'failed' | 'cancelled';
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  /** Generation cost in USD; null when un-priced or on failed/cancelled runs. */
  costUsd: number | null;
  findingsCount: number;
  grounding: string;
  /** Review score (0-100); null on failed/cancelled runs. */
  score?: number | null;
  /** Findings that tripped the agent's gate; 0 on failed/cancelled runs. */
  blockers?: number | null;
  /** Failure reason (status='failed') / cancellation note. Null clears it. */
  error?: string | null;
}

/** An in-flight run, as the PR page's "running now" indicator reads it. */
export interface ActiveRun {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  ran_at: string | null;
}
