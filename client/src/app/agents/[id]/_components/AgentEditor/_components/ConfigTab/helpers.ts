import type { Agent, CiFailOn, Provider, ReviewStrategy } from "@devdigest/shared";

/** The editable fields of the Config tab — one object instead of nine useStates. */
export interface ConfigForm {
  name: string;
  description: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  repoIntel: boolean;
  enabled: boolean;
}

/** Initial form state for an agent (the tab is re-mounted per agent via `key`). */
export function formFromAgent(agent: Agent): ConfigForm {
  return {
    name: agent.name,
    description: agent.description,
    provider: agent.provider,
    model: agent.model,
    systemPrompt: agent.system_prompt,
    strategy: agent.strategy,
    ciFailOn: agent.ci_fail_on,
    repoIntel: agent.repo_intel,
    enabled: agent.enabled,
  };
}

/** The PUT /agents/:id patch for a form (wire field names). */
export function formToPatch(form: ConfigForm) {
  return {
    name: form.name,
    description: form.description,
    provider: form.provider,
    model: form.model,
    system_prompt: form.systemPrompt,
    strategy: form.strategy,
    ci_fail_on: form.ciFailOn,
    repo_intel: form.repoIntel,
    enabled: form.enabled,
  };
}
