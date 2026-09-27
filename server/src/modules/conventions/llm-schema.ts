import { z } from 'zod';
import { ConventionCategory } from '@devdigest/shared';

/**
 * The structured reply of the PROPOSE call (ring 1). Internal to this module —
 * NOT a wire contract: nothing here reaches the client until the evidence gate
 * has re-derived the snippet and line range from the real file.
 *
 * Kept to the subset OpenAI strict json_schema accepts (every field required,
 * no numeric bounds) — confidence is clamped in code instead. Field order is
 * generation order: the model states the rule and cites evidence BEFORE it
 * labels and scores it, so the score is conditioned on the evidence it wrote.
 */
export const ExtractedEvidence = z.object({
  file: z.string().describe('Repo-relative path exactly as given in the source="…" label, without the "config:"/"source:" prefix'),
  line_start: z.number().int().describe('First line of the snippet, using the line numbers shown in the gutter'),
  line_end: z.number().int().describe('Last line of the snippet'),
  snippet: z.string().describe('The cited code copied verbatim WITHOUT the line-number gutter'),
});

export const ExtractedConvention = z.object({
  rule: z.string().describe('One imperative sentence a reviewer can check a diff against'),
  evidence: ExtractedEvidence,
  category: ConventionCategory,
  confidence: z.number().describe('0..1 — how consistently the sampled files follow this rule'),
});
export type ExtractedConvention = z.infer<typeof ExtractedConvention>;

export const ConventionExtraction = z.object({
  conventions: z.array(ExtractedConvention),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;
