/* hooks/conventions.ts — React Query hooks for Skills Lab → Conventions:
   the repo's extracted house-rules, triage (accept / reject / inline edit),
   and merging accepted rules into a skill linked to agents. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { agentKeys } from "./agents";
import { skillKeys } from "./skills";
import type {
  Convention,
  ConventionSkillDraft,
  ConventionsResponse,
  CreateConventionsSkillRequest,
  CreateConventionsSkillResult,
  UpdateConventionRequest,
} from "@devdigest/shared";

// Query keys for this resource. Components never build raw key arrays.
export const conventionKeys = {
  list: (repoId: string | null | undefined) => ["conventions", repoId] as const,
  skillDraft: (repoId: string, conventionIds: readonly string[]) =>
    ["conventions", repoId, "skill-draft", [...conventionIds].sort().join(",")] as const,
};

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionKeys.list(repoId),
    queryFn: () => api.get<ConventionsResponse>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Run (or re-run) the scan. Synchronous server-side — resolves with the fresh list. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionsResponse>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => qc.setQueryData(conventionKeys.list(repoId), data),
  });
}

/** Rejected rows leave the list (they are never listed again); others are replaced in place. */
function withUpdated(data: ConventionsResponse | undefined, row: Convention) {
  if (!data) return data;
  const items =
    row.status === "rejected"
      ? data.items.filter((c) => c.id !== row.id)
      : data.items.map((c) => (c.id === row.id ? row : c));
  return { ...data, items };
}

export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateConventionRequest }) =>
      api.patch<Convention>(`/conventions/${id}`, patch),
    onSuccess: (row) =>
      qc.setQueryData<ConventionsResponse>(conventionKeys.list(repoId), (d) => withUpdated(d, row)),
  });
}

/**
 * The editable skill draft merged from `conventionIds`. A POST (the id list is
 * a body) but side-effect free, so it's a query: fetched when the modal opens,
 * never cached past it — the accepted set may change between openings.
 */
export function useConventionSkillDraft(repoId: string, conventionIds: string[]) {
  return useQuery({
    queryKey: conventionKeys.skillDraft(repoId, conventionIds),
    queryFn: () =>
      api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`, {
        convention_ids: conventionIds,
      }),
    enabled: conventionIds.length > 0,
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
}

export function useCreateConventionsSkill(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConventionsSkillRequest) =>
      api.post<CreateConventionsSkillResult>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: skillKeys.list() });
      qc.invalidateQueries({ queryKey: skillKeys.detail(res.skill.id) });
      qc.invalidateQueries({ queryKey: skillKeys.versions(res.skill.id) });
      qc.invalidateQueries({ queryKey: agentKeys.list() });
      for (const agentId of res.linked_agent_ids) {
        qc.invalidateQueries({ queryKey: agentKeys.skills(agentId) });
      }
    },
  });
}
