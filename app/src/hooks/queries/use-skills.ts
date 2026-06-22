import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriSkills } from "../../lib/tauri";

export function useSkills(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.skills(agentPath ?? ""),
    queryFn: () => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriSkills.list(agentPath);
    },
    enabled: !!agentPath,
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

export function useSaveSkill(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriSkills.save(agentPath, name, content);
    },
    onSuccess: (_data, { name }) => {
      if (agentPath) {
        qc.invalidateQueries({ queryKey: queryKeys.skills(agentPath) });
        qc.invalidateQueries({
          queryKey: queryKeys.skillDetail(agentPath, name),
        });
      }
    },
  });
}

export function useDeleteSkill(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriSkills.delete(agentPath, name);
    },
    onSettled: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.skills(agentPath) });
    },
  });
}
