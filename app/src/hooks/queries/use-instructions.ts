import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgent } from "../../lib/tauri";

export function useInstructions(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.instructions(agentPath ?? ""),
    queryFn: () => {
      if (!agentPath) throw new Error("agentPath required");
      return tauriAgent.readFile(agentPath, "CLAUDE.md").catch(() => "");
    },
    enabled: !!agentPath,
  });
}

export function useSaveInstructions(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) => {
      if (!agentPath) throw new Error("agentPath required");
      return tauriAgent.writeFile(agentPath, name, content);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.instructions(agentPath) });
    },
  });
}
