import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgent } from "../../lib/tauri";

/** One agent's instructions (its CLAUDE.md). Shared so every reader of an
 *  agent's job description hits the same cache entry and invalidation. A
 *  missing file reads as `""`; any other failure is a query error, already
 *  reported by the engine-call layer (`lib/tauri.ts`). */
export function instructionsQueryOptions(agentPath: string | undefined) {
  return {
    queryKey: queryKeys.instructions(agentPath ?? ""),
    queryFn: () => {
      if (!agentPath) throw new Error("agentPath required");
      return tauriAgent.readFile(agentPath, "CLAUDE.md");
    },
    enabled: !!agentPath,
    staleTime: 30_000,
  };
}

export function useInstructions(agentPath: string | undefined) {
  return useQuery(instructionsQueryOptions(agentPath));
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
