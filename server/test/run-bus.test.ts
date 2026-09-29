import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunBus } from '../src/platform/sse.js';

describe('RunBus — replay buffer lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a late subscriber replays the buffer and gets done right away', async () => {
    const bus = new RunBus();
    bus.publish('r1', 'info', 'a');
    bus.publish('r1', 'info', 'b');
    bus.complete('r1');

    const seen: string[] = [];
    bus.subscribe('r1', (e) => seen.push(e.msg));
    const done = await new Promise<boolean>((resolve) => bus.onDone('r1', () => resolve(true)));

    expect(seen).toEqual(['a', 'b']);
    expect(done).toBe(true);
    expect(bus.knows('r1')).toBe(true);
  });

  it('forgets a completed run after the TTL (no per-run memory for the process lifetime)', () => {
    vi.useFakeTimers();
    const bus = new RunBus();
    bus.publish('r2', 'info', 'x');
    bus.complete('r2');
    expect(bus.knows('r2')).toBe(true);

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(bus.knows('r2')).toBe(false);
    expect(bus.isComplete('r2')).toBe(false);
    expect(bus.buffer('r2')).toEqual([]);
  });

  it('keeps a run someone is still listening to, and publish survives an eviction', () => {
    vi.useFakeTimers();
    const bus = new RunBus();
    bus.publish('r3', 'info', 'before cancel');
    bus.complete('r3'); // e.g. cancelRun — the runner may keep publishing
    const seen: string[] = [];
    bus.subscribe('r3', (e) => seen.push(e.msg));

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(bus.knows('r3')).toBe(true); // listener attached → not evicted

    expect(() => bus.publish('r3', 'info', 'after')).not.toThrow();
    expect(seen).toContain('after');
  });
});
