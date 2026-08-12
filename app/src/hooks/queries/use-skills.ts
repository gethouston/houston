import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriSkills } from "../../lib/tauri";
import type { RepoSkill } from "../../lib/types";

export function useSkills(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.skills(agentPath ?? ""),
    queryFn: () => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriSkills.list(agentPath);
    },
    enabled: !!agentPath,
    staleTime: 30_000,
  });
}

export function useSkillDetail(
  agentPath: string | undefined,
  name: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.skillDetail(agentPath ?? "", name ?? ""),
    queryFn: () => {
      if (!agentPath) throw new Error("agentPath is required");
      if (!name) throw new Error("name is required");
      return tauriSkills.load(agentPath, name);
    },
    enabled: !!agentPath && !!name,
    staleTime: 30_000,
  });
}

export function useCreateSkill(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      name: string;
      description: string;
      content: string;
    }) => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriSkills.create(
        agentPath,
        args.name,
        args.description,
        args.content,
      );
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.skills(agentPath) });
    },
  });
}

export function useListSkillsFromRepo(agentPath: string | undefined) {
  return useMutation({
    mutationFn: (source: string) => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriSkills.listFromRepo(agentPath, source);
    },
  });
}

export function useInstallSkillFromRepo(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      source,
      skills,
    }: {
      source: string;
      skills: RepoSkill[];
    }) => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriSkills.installFromRepo(agentPath, source, skills);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.skills(agentPath) });
    },
  });
}

export function useInstallCommunitySkill(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      source,
      skillId,
      signal,
    }: {
      source: string;
      skillId: string;
      signal?: AbortSignal;
    }) => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriSkills.installCommunity(agentPath, source, skillId, signal);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.skills(agentPath) });
    },
  });
}
