import { useQuery } from "@tanstack/react-query";
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
