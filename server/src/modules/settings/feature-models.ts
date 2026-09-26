import {
  FEATURE_MODELS,
  FeatureModelChoice,
  type FeatureModelId,
  type Settings,
} from '@devdigest/shared';

/**
 * Per-feature model configuration (ring 1 — pure).
 *
 * System LLM features (onboarding, intent, risk brief, conformance, conventions)
 * read their provider/model from the workspace's Settings instead of a hardcoded
 * module constant. When the workspace hasn't chosen one, we fall back to the
 * registry default in `FEATURE_MODELS` — which mirrors each module's old
 * constant, so behaviour is unchanged until a model is explicitly picked.
 * The DB read lives in `SettingsService.featureModelOverride`.
 */

const DEFAULTS = Object.fromEntries(
  FEATURE_MODELS.map((f) => [f.id, { provider: f.defaultProvider, model: f.defaultModel }]),
) as Record<FeatureModelId, FeatureModelChoice>;

/** The registry default (provider+model) for a feature — no DB read. */
export function defaultFeatureModel(id: FeatureModelId): FeatureModelChoice {
  return DEFAULTS[id];
}

/** The workspace's override for `id` inside `settings`, or `undefined` when unset/invalid. */
export function featureModelOverrideIn(
  settings: Settings,
  id: FeatureModelId,
): FeatureModelChoice | undefined {
  const fm = (settings as { feature_models?: Record<string, unknown> }).feature_models;
  const parsed = FeatureModelChoice.safeParse(fm?.[id]);
  return parsed.success ? parsed.data : undefined;
}
