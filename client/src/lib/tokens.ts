/**
 * Token in→out summary (e.g. "12k→1.5k").
 *
 * Lives here rather than beside the run-trace drawer because two surfaces now
 * need it — the drawer's TOKENS stat card and the verdict banner's cost line —
 * and a shared component must not import out of a route-local `_components`
 * folder.
 */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}
