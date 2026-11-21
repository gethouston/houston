import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { isAssistantUnavailableError } from "../lib/assistant-availability.ts";
import { runDiscoveryLadder } from "../lib/assistant-discovery-ladder.ts";
import {
  type AssistantDiscovery,
  assistantDiscoveryState,
} from "../lib/assistant-discovery-state.ts";
import { assistantRefetchIntervalMs } from "../lib/assistant-retry-schedule.ts";
import { newEngineActive } from "../lib/engine.ts";
import { queryKeys } from "../lib/query-keys.ts";
import {
  type AssistantHandle,
  surfaceEngineError,
  tauriAssistant,
} from "../lib/tauri.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";

export type {
  AssistantDiscovery,
  AssistantFailure,
} from "../lib/assistant-discovery-state.ts";

export interface AssistantAccess extends AssistantDiscovery {
  retry: () => Promise<void>;
}

export function discoverAssistant(
  signal?: AbortSignal,
): Promise<AssistantHandle> {
  return runDiscoveryLadder({
    ask: () => tauriAssistant.discover({ surface: false }),
    surface: (err) =>
      surfaceEngineError("get_assistant", err, undefined, {
        silence: isAssistantUnavailableError,
      }),
    signal,
  });
}

export function assistantQueryOptions(spaceId: string | null) {
  return {
    queryKey: queryKeys.assistant(spaceId),
    queryFn: ({ signal }: { signal: AbortSignal }) => discoverAssistant(signal),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  };
}

export function useAssistant(): AssistantAccess {
  const enabled = newEngineActive();
  const spaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const query = useQuery({
    ...assistantQueryOptions(spaceId),
    enabled,
    retry: false,
    refetchInterval: (q) => assistantRefetchIntervalMs(q.state.error),
  });

  const { refetch } = query;
  const retry = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    ...assistantDiscoveryState({
      enabled,
      handle: query.data ?? null,
      error: query.error,
    }),
    retry,
  };
}
