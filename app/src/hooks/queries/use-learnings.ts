import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as learnings from "../../data/learnings";
import { queryKeys } from "../../lib/query-keys";

export function useLearnings(agentPath: string | undefined) {
  const q = useQuery({
    queryKey: queryKeys.learnings(agentPath ?? ""),
    queryFn: () => learnings.list(agentPath ?? ""),
    enabled: !!agentPath,
  });
  // Adapt to legacy `{ index, text }[]` shape so existing UIs keep working.
  const entries = (q.data ?? []).map((l, index) => ({
    index,
    text: l.text,
    id: l.id,
  }));
  return { data: { entries }, isLoading: q.isLoading };
}

export function useAddLearning(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => {
      if (!agentPath) throw new Error("agentPath required");
      return learnings.add(agentPath, text);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.learnings(agentPath) });
    },
  });
}

export function useRemoveLearning(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (index: number) => {
      if (!agentPath) throw new Error("agentPath required");
      const all = await learnings.list(agentPath);
      const target = all[index];
      if (!target) return;
      await learnings.remove(agentPath, target.id);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.learnings(agentPath) });
    },
  });
}

export function useUpdateLearning(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => {
      if (!agentPath) throw new Error("agentPath required");
      return learnings.update(agentPath, id, text);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.learnings(agentPath) });
    },
  });
}
