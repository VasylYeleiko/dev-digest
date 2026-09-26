import type { Finding, PrDetail, PrMeta } from '@devdigest/shared';
import type { FindingPreview, PrCommitEntity, PrFileEntity, PullEntity } from './types.js';
import { deriveReviewStatus, previewFindings, rollupSeverities } from './status.js';

/**
 * pulls — pure entity → wire mappers (ring 1). No I/O.
 */

/** Group newest-first review scores into "latest review per PR". */
export function latestReviewByPr<T extends { prId: string }>(newestFirst: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const rv of newestFirst) if (!out.has(rv.prId)) out.set(rv.prId, rv);
  return out;
}

/** Group finding previews by their review. */
export function groupByReview(rows: FindingPreview[]): Map<string, FindingPreview[]> {
  const out = new Map<string, FindingPreview[]>();
  for (const f of rows) {
    const list = out.get(f.reviewId) ?? [];
    list.push(f);
    out.set(f.reviewId, list);
  }
  return out;
}

/** One PR-list row: the PR plus its latest review's score/findings and total cost. */
export function toPrListItem(
  pull: PullEntity,
  latest: { score: number | null; findings: FindingPreview[] } | undefined,
  costUsd: number | null,
  now: number,
): PrMeta {
  return {
    id: pull.id,
    number: pull.number,
    title: pull.title,
    author: pull.author,
    branch: pull.branch,
    base: pull.base,
    head_sha: pull.headSha,
    additions: pull.additions,
    deletions: pull.deletions,
    files_count: pull.filesCount,
    status: deriveReviewStatus({
      ghStatus: pull.status,
      lastReviewedSha: pull.lastReviewedSha,
      headSha: pull.headSha,
      updatedAt: pull.updatedAt,
      now,
    }),
    opened_at: pull.openedAt?.toISOString() ?? null,
    updated_at: pull.updatedAt?.toISOString() ?? null,
    score: latest ? latest.score : null,
    cost_usd: costUsd,
    findings: latest ? rollupSeverities(latest.findings) : null,
    findings_preview: latest
      ? previewFindings(latest.findings).map((f) => ({
          id: f.id,
          severity: f.severity as Finding['severity'],
          category: f.category as Finding['category'],
          title: f.title,
          file: f.file,
          start_line: f.startLine,
          confidence: f.confidence,
          rationale: f.rationale,
        }))
      : null,
  };
}

/** The persisted (offline) PR detail — what we serve when GitHub is unreachable. */
export function toPersistedPrDetail(
  pull: PullEntity,
  files: PrFileEntity[],
  commits: PrCommitEntity[],
): PrDetail {
  return {
    id: pull.id,
    number: pull.number,
    title: pull.title,
    author: pull.author,
    branch: pull.branch,
    base: pull.base,
    head_sha: pull.headSha,
    additions: pull.additions,
    deletions: pull.deletions,
    files_count: pull.filesCount,
    status: pull.status as PrDetail['status'],
    opened_at: pull.openedAt?.toISOString() ?? null,
    updated_at: pull.updatedAt?.toISOString() ?? null,
    body: pull.body ?? null,
    files: files.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    })),
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      author: c.author,
      committed_at: c.committedAt?.toISOString() ?? null,
    })),
  };
}

/** GitHub's per-file detail → the persisted `pr_files` shape. */
export function toPrFileEntities(files: PrDetail['files']): PrFileEntity[] {
  return files.map((f) => ({
    path: f.path,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch ?? null,
  }));
}

/** GitHub's commit list → the persisted `pr_commits` shape. */
export function toPrCommitEntities(commits: PrDetail['commits']): PrCommitEntity[] {
  return commits.map((c) => ({
    sha: c.sha,
    message: c.message,
    author: c.author,
    committedAt: c.committed_at ? new Date(c.committed_at) : null,
  }));
}
