import type {
  ConnTestProvider,
  ConnTestResult,
  FeatureModelChoice,
  FeatureModelId,
  GitHubClientResolver,
  LLMProviderResolver,
  SecretsProvider,
  SecretsStatus,
  Settings,
} from '@devdigest/shared';
import type { SettingsStore } from './ports.js';
import { rowsToSettings } from './helpers.js';
import { defaultFeatureModel, featureModelOverrideIn } from './feature-models.js';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';

/**
 * F1 — settings service (ring 2): non-secret prefs, which provider keys are
 * configured, provider connection tests, and per-feature model resolution.
 * Secrets are NOT stored in `settings` — only through the SecretsProvider port.
 */

export interface SettingsServiceDeps {
  settings: SettingsStore;
  secrets: SecretsProvider;
  github: GitHubClientResolver;
  llm: LLMProviderResolver;
  /** Drop cached provider clients so the next resolve picks up a changed secret. */
  invalidateSecretCaches: () => void;
}

export class SettingsService {
  constructor(private deps: SettingsServiceDeps) {}

  async get(workspaceId: string): Promise<Settings> {
    return rowsToSettings(await this.deps.settings.listForWorkspace(workspaceId));
  }

  /** Upsert every key in `patch`, then return the workspace's merged prefs. */
  async update(workspaceId: string, userId: string, patch: Record<string, unknown>): Promise<Settings> {
    for (const [key, value] of Object.entries(patch)) {
      await this.deps.settings.upsert(workspaceId, userId, key, value);
    }
    return this.get(workspaceId);
  }

  /** Which provider keys are configured — booleans only, never the values. */
  async secretsStatus(): Promise<SecretsStatus> {
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, string][]).map(
        async ([provider, key]) => [provider, Boolean(await this.deps.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  }

  /**
   * Test a provider connection with a cheap live call (listModels / GET user).
   * If the UI supplied a key, persist it first (BYO key) so the test reflects —
   * and the rest of the app can use — the new value. Never throws.
   */
  async testConnection(provider: ConnTestProvider, key?: string): Promise<ConnTestResult> {
    try {
      if (key) {
        if (!this.deps.secrets.set) {
          return { provider, ok: false, message: 'Secrets backend is read-only' };
        }
        await this.deps.secrets.set(SECRET_KEY_BY_PROVIDER[provider], key);
        this.deps.invalidateSecretCaches();
      }
      if (provider === GITHUB_PROVIDER) {
        const gh = await this.deps.github();
        const login = await gh.currentLogin();
        return { provider, ok: true, message: `Connected as @${login}` };
      }
      const llm = await this.deps.llm(provider);
      const models = await llm.listModels();
      return { provider, ok: true, message: `OK — ${models.length} models available` };
    } catch (err) {
      return { provider, ok: false, message: (err as Error).message };
    }
  }

  /**
   * The workspace's override for `id`, or `undefined` when unset/invalid.
   * Callers that keep their own dynamic default (e.g. conventions) use this
   * directly; callers with a static default use `resolveFeatureModel`.
   */
  async featureModelOverride(
    workspaceId: string,
    id: FeatureModelId,
  ): Promise<FeatureModelChoice | undefined> {
    return featureModelOverrideIn(await this.get(workspaceId), id);
  }

  /** Resolve `id` to a concrete provider+model: workspace override, else registry default. */
  async resolveFeatureModel(workspaceId: string, id: FeatureModelId): Promise<FeatureModelChoice> {
    return (await this.featureModelOverride(workspaceId, id)) ?? defaultFeatureModel(id);
  }
}
