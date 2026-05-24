/**
 * TanStack Query hooks for `/v1/checkpoints/*` — Phase 5 of RFC #248
 * (`advanced.checkpoints`).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CheckpointListResponse } from "@houston-ai/engine-client";
import { tauriCheckpoints } from "../lib/tauri";

const STALE_MS = 10_000;

export function useCheckpoints(agentPath: string | null | undefined) {
  return useQuery<CheckpointListResponse>({
    queryKey: ["checkpoints", agentPath ?? ""] as const,
    queryFn: () => tauriCheckpoints.list(agentPath as string),
    enabled: Boolean(agentPath),
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
  });
}

export function useCreateCheckpoint(agentPath: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => tauriCheckpoints.create(agentPath as string, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["checkpoints", agentPath ?? ""] });
    },
  });
}

export function useRestoreCheckpoint(agentPath: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (checkpointId: string) =>
      tauriCheckpoints.restore(agentPath as string, checkpointId),
    onSuccess: () => {
      // Restoring overwrites .houston — invalidate everything agent-scoped.
      if (agentPath) {
        void qc.invalidateQueries();
      }
    },
  });
}

export function useDeleteCheckpoint(agentPath: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (checkpointId: string) =>
      tauriCheckpoints.delete(agentPath as string, checkpointId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["checkpoints", agentPath ?? ""] });
    },
  });
}
