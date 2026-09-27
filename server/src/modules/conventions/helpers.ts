import type { Convention, ConventionScan } from '@devdigest/shared';
import { MAX_RULE_CHARS } from './constants.js';
import { verifyEvidence } from './evidence.js';
import type { ExtractedConvention } from './llm-schema.js';
import type { NewConvention } from './ports.js';
import type { ConventionEntity, ConventionScanEntity } from './types.js';

/**
 * conventions — pure helpers (ring 1): entity → DTO mapping and the small
 * rules the service applies to model output.
 */

export function toConventionDto(row: ConventionEntity): Convention {
  return {
    id: row.id,
    repo_id: row.repoId,
    category: row.category,
    rule: row.rule,
    evidence_path: row.evidencePath,
    evidence_line_start: row.evidenceLineStart,
    evidence_line_end: row.evidenceLineEnd,
    evidence_snippet: row.evidenceSnippet,
    confidence: row.confidence,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toConventionScanDto(row: ConventionScanEntity): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    provider: row.provider,
    model: row.model,
    sample_files: row.sampleFiles,
    proposed: row.proposed,
    dropped: row.dropped,
    skipped: row.skipped,
    cost_usd: row.costUsd,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * Dedupe key for a rule: case, quotes, backticks, punctuation and spacing
 * don't make two rules different. Used to keep an accepted/rejected rule from
 * coming back as a fresh `pending` candidate on re-scan.
 */
export function ruleKey(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[`'"“”‘’().,:;!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The model's self-reported score, clamped to 0..1 and rounded; null if junk. */
export function clampConfidence(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

export interface GateOutcome {
  rows: NewConvention[];
  /** Thrown out by the evidence gate (or an empty rule). */
  dropped: number;
  /** Already triaged (accepted/rejected) or repeated within this reply. */
  skipped: number;
}

/**
 * Turn the model's proposals into persistable `pending` rows: every survivor
 * cites code that really exists in the sample, and no rule the user already
 * accepted or rejected comes back.
 */
export function gateCandidates(
  candidates: readonly ExtractedConvention[],
  files: ReadonlyMap<string, string>,
  triagedRules: readonly string[],
): GateOutcome {
  const seen = new Set(triagedRules.map(ruleKey));
  const rows: NewConvention[] = [];
  let dropped = 0;
  let skipped = 0;
  for (const c of candidates) {
    const rule = c.rule.trim().slice(0, MAX_RULE_CHARS);
    const key = ruleKey(rule);
    if (!key) {
      dropped += 1;
      continue;
    }
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    const check = verifyEvidence(c.evidence, files);
    if (!check.ok) {
      dropped += 1;
      continue;
    }
    seen.add(key);
    rows.push({
      category: c.category,
      rule,
      evidencePath: check.evidence.path,
      evidenceLineStart: check.evidence.lineStart,
      evidenceLineEnd: check.evidence.lineEnd,
      evidenceSnippet: check.evidence.snippet,
      confidence: clampConfidence(c.confidence),
    });
  }
  return { rows, dropped, skipped };
}
