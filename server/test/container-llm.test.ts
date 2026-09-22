/**
 * Container `buildLlm` wiring — hermetic, no network. Verifies the actual
 * regression this fix closes: OpenAI/Anthropic used to be constructed with
 * ONLY an API key, so no cost estimator (live-or-fallback) could ever reach
 * them. Mocks the two adapter classes themselves (not the underlying SDKs —
 * there's no existing precedent for that in this suite) so we can inspect
 * exactly what `buildLlm` passes into each constructor without making a
 * real API call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const openaiCtor = vi.fn();
const anthropicCtor = vi.fn();

vi.mock('../src/adapters/llm/openai.js', () => ({
  OpenAIProvider: class {
    constructor(...args: unknown[]) {
      openaiCtor(...args);
    }
  },
}));
vi.mock('../src/adapters/llm/anthropic.js', () => ({
  AnthropicProvider: class {
    constructor(...args: unknown[]) {
      anthropicCtor(...args);
    }
  },
}));

const { Container } = await import('../src/platform/container.js');
const { loadConfig } = await import('../src/platform/config.js');

class StubSecrets {
  async get(key: string): Promise<string | undefined> {
    // OPENROUTER_API_KEY must stay unset — a truthy value here would make
    // PriceBook's lazy refresh attempt a REAL network call to OpenRouter
    // (its `if (!key) return []` short-circuit is what keeps this hermetic).
    if (key === 'OPENROUTER_API_KEY') return undefined;
    return 'fake-key';
  }
}

beforeEach(() => {
  openaiCtor.mockClear();
  anthropicCtor.mockClear();
});

describe('Container.buildLlm — cost estimator wiring', () => {
  it('passes an estimateCost callback into OpenAIProvider (not just the API key)', async () => {
    const container = new Container(loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv), {} as never, {
      secrets: new StubSecrets(),
    });

    await container.llm('openai');

    expect(openaiCtor).toHaveBeenCalledTimes(1);
    const [key, opts] = openaiCtor.mock.calls[0]!;
    expect(key).toBe('fake-key');
    expect(typeof (opts as { estimateCost?: unknown }).estimateCost).toBe('function');
  });

  it('passes an estimateCost callback into AnthropicProvider (not just the API key)', async () => {
    const container = new Container(loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv), {} as never, {
      secrets: new StubSecrets(),
    });

    await container.llm('anthropic');

    expect(anthropicCtor).toHaveBeenCalledTimes(1);
    const [key, opts] = anthropicCtor.mock.calls[0]!;
    expect(key).toBe('fake-key');
    expect(typeof (opts as { estimateCost?: unknown }).estimateCost).toBe('function');
  });

  it('the injected callback resolves a real (non-OpenRouter) model via the fallback pricing table', async () => {
    const container = new Container(loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv), {} as never, {
      secrets: new StubSecrets(),
    });

    await container.llm('anthropic');
    const [, opts] = anthropicCtor.mock.calls[0]!;
    const estimateCost = (opts as { estimateCost: (m: string, i: number, o: number) => number | null })
      .estimateCost;

    // Exercises the whole chain this bug broke: buildLlm → priceBook.estimate
    // → (no live OpenRouter listing configured here) → the static table,
    // including the dated-snapshot fallback.
    expect(estimateCost('claude-haiku-4-5-20251001', 1_000_000, 0)).not.toBeNull();
  });
});
