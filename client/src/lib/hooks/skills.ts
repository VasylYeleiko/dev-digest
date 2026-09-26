/* hooks/skills.ts — React Query hooks for the Skills Lab (skills list, Skill
   Editor, and the Add-Skill import drawer). Mirrors hooks/agents.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Skill, SkillVersion, SkillStats, SkillImportPreview, CreateSkillRequest } from "@devdigest/shared";

// Query keys for this resource. Components never build raw key arrays —
// cross-component refreshes go through these.
export const skillKeys = {
  list: () => ["skills"] as const,
  detail: (id: string | null | undefined) => ["skill", id] as const,
  versions: (id: string | null | undefined) => ["skill", id, "versions"] as const,
  stats: (id: string | null | undefined) => ["skill", id, "stats"] as const,
};

export function useSkills() {
  return useQuery({
    queryKey: skillKeys.list(),
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.detail(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillRequest) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: skillKeys.list() }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "source" | "enabled">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: skillKeys.list() });
      // A body change bumps the version server-side, so versions/stats can go
      // stale even on a save that only touched other fields — invalidate both.
      qc.invalidateQueries({ queryKey: skillKeys.versions(data.id) });
      qc.invalidateQueries({ queryKey: skillKeys.stats(data.id) });
      qc.setQueryData(skillKeys.detail(data.id), data);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: skillKeys.list() });
      qc.removeQueries({ queryKey: skillKeys.detail(id) });
    },
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.versions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.stats(id),
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

export interface ImportSkillInput {
  filename: string;
  content_base64: string;
}

/** Parses a file/archive into a preview — nothing persists, so no cache invalidation. */
export function useImportSkill() {
  return useMutation({
    mutationFn: (input: ImportSkillInput) => api.post<SkillImportPreview>("/skills/import", input),
  });
}
