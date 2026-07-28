import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as learnings from "../../data/learnings";
import type { LearningSourceRow } from "../../lib/learning-provenance";
import { isMultiplayer } from "../../lib/org-roles";
import { queryKeys } from "../../lib/query-keys";
import { useCapabilities } from "../use-capabilities";
import { useSession } from "../use-session";

export function useLearnings(agentPath: string | undefined) {
  const q = useQuery({
    queryKey: queryKeys.learnings(agentPath ?? ""),
    queryFn: () => learnings.list(agentPath ?? ""),
    enabled: !!agentPath,
  });
  // Adapt to the legacy `{ index, text }[]` shape so existing UIs keep working,
  // carrying the provenance fields through: the Memory rows show who taught a
  // learning and which mission it came from, and dropping them here (as this
  // adapter used to) makes that invisible no matter what the file says.
  const entries: LearningSourceRow[] = (q.data ?? []).map((l, index) => ({
    index,
    text: l.text,
    id: l.id,
    ...(l.taught_by ? { taughtBy: l.taught_by } : {}),
    ...(l.mission_id ? { missionId: l.mission_id } : {}),
    ...(l.mission_title ? { missionTitle: l.mission_title } : {}),
  }));
  return { data: { entries }, isLoading: q.isLoading };
}

export function useAddLearning(agentPath: string | undefined) {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const { capabilities } = useCapabilities();
  // WHO is adding this learning by hand. Multiplayer only: in single player the
  // answer is always "the one user", so stamping it would add an identity key
  // to every desktop learnings.json for no reader.
  const taughtBy =
    isMultiplayer(capabilities) && session
      ? {
          user_id: session.uid,
          ...(session.displayName ? { name: session.displayName } : {}),
        }
      : undefined;
  return useMutation({
    mutationFn: (text: string) => {
      if (!agentPath) throw new Error("agentPath required");
      return learnings.add(agentPath, text, taughtBy);
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
