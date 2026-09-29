/**
 * Token-count heuristic — pure, no encoder, no I/O (shared kernel).
 *
 * Used where an approximate count is enough (the trace's per-slot "Skills"
 * figure) and as the fallback inside the tiktoken adapter when the BPE ranks
 * fail to load. Mirrors the client's copy in the Skills editor.
 */

export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
