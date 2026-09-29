/** Rule ids the server's scanner emits that have their own i18n label; anything else → "unknown". */
export const KNOWN_RULES: ReadonlySet<string> = new Set([
  "ignore_instructions",
  "role_override",
  "fake_role_header",
  "safety_override",
  "forced_verdict",
  "suppress_security",
  "prompt_exfiltration",
  "hidden_characters",
  "hidden_comment_instruction",
]);
