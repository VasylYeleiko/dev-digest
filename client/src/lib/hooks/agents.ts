/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Agent, AgentSkillLink, ModelInfo, Provider, ReviewStrategy } from "@devdigest/shared";

// Query keys for this resource. `providerModels.all` is exported because
// `useTestConnection` (core.ts) must refresh every provider's model list.
export const agentKeys = {
  list: () => ["agents"] as const,
  detail: (id: string | null | undefined) => ["agent", id] as const,
  skills: (agentId: string | null | undefined) => ["agent", agentId, "skills"] as const,
  providerModels: {
    all: () => ["provider-models"] as const,
    byProvider: (provider: Provider | null | undefined) => ["provider-models", provider] as const,
  },
};

export function useAgents() {
  return useQuery({
    queryKey: agentKeys.list(),
    queryFn: () => api.get<Agent[]>("/agents"),
  });
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: !!id,
  });
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  enabled?: boolean;
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.post<Agent>("/agents", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.list() }),
  });
}

export interface UpdateAgentInput {
  id: string;
  patch: Partial<
    Pick<
      Agent,
      | "name"
      | "description"
      | "provider"
      | "model"
      | "system_prompt"
      | "output_schema"
      | "strategy"
      | "ci_fail_on"
      | "repo_intel"
      | "enabled"
    >
  >;
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateAgentInput) => api.put<Agent>(`/agents/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: agentKeys.list() });
      qc.setQueryData(agentKeys.detail(data.id), data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: agentKeys.list() });
      qc.removeQueries({ queryKey: agentKeys.detail(id) });
    },
  });
}

/** Skills linked to an agent, ordered (Agent Editor's Skills tab). */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: agentKeys.skills(agentId),
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/** Whole-set replace of an agent's linked skills (order = array order).
 *  Applies the new order OPTIMISTICALLY (setQueryData before the request
 *  resolves) so a drag-drop reorder in SkillsTab doesn't visually snap back
 *  to the stale order while the mutation is in flight; reverts on error. */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillIds }: { agentId: string; skillIds: string[] }) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onMutate: async ({ agentId, skillIds }) => {
      await qc.cancelQueries({ queryKey: agentKeys.skills(agentId) });
      const previous = qc.getQueryData<AgentSkillLink[]>(agentKeys.skills(agentId));
      qc.setQueryData<AgentSkillLink[]>(
        agentKeys.skills(agentId),
        skillIds.map((skillId, order) => ({ agent_id: agentId, skill_id: skillId, order })),
      );
      return { previous, agentId };
    },
    onError: (_err, _vars, context) => {
      if (context) qc.setQueryData(agentKeys.skills(context.agentId), context.previous);
    },
    onSettled: (_data, _err, { agentId }) => {
      qc.invalidateQueries({ queryKey: agentKeys.skills(agentId) });
    },
  });
}

/** Dynamic model list for a provider (editor model picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: agentKeys.providerModels.byProvider(provider),
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}
