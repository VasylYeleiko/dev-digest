import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SecretsProvider, SecretKey } from '@devdigest/shared';

/**
 * LocalSecretsProvider — writable MVP secrets backend.
 *
 * Reads stored overrides from a JSON file on disk (BYO keys entered via the
 * UI), falling back to process.env when a key has not been set. Writes persist
 * to the same file (mode 0600) so keys survive restarts. GITHUB_TOKEN is the
 * canonical key; GITHUB_PAT is still read as a fallback for back-compat.
 *
 * Stored values take precedence over env so a key entered in the UI wins.
 * Swap for a VaultSecretsProvider later without touching call sites.
 */
export class LocalSecretsProvider implements SecretsProvider {
  private cache: Record<string, string> | null = null;

  constructor(
    private readonly filePath: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  private async load(): Promise<Record<string, string>> {
    if (this.cache) return this.cache;
    const data: Record<string, string> = {};
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // Keep only string values — a hand-edited file must not smuggle
        // non-strings into callers typed as `string | undefined`.
        for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') data[k] = v;
      }
    } catch {
      // Missing or unreadable file → no stored overrides yet.
    }
    this.cache = data;
    return data;
  }

  async get(key: SecretKey): Promise<string | undefined> {
    const stored = (await this.load())[key as string];
    if (stored) return stored;
    if (key === 'GITHUB_TOKEN') return this.env.GITHUB_TOKEN ?? this.env.GITHUB_PAT;
    return this.env[key as string];
  }

  async set(key: SecretKey, value: string): Promise<void> {
    const data = await this.load();
    data[key as string] = value;
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    // writeFile's `mode` applies only when it creates the file; re-assert it so
    // a pre-existing, looser file is tightened on every write.
    await chmod(this.filePath, 0o600);
  }
}
