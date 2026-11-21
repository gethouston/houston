import type { LinkedInConnection } from "@houston/engine-adapter";
import {
  type LinkedInConnectWatch,
  linkedInConnectPollMs,
} from "@houston/sdk/linkedin/policy";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { tauriLinkedIn } from "../../lib/linkedin-facade";
import { queryKeys } from "../../lib/query-keys";

export function useLinkedInConnection(
  enabled: boolean,
  watch: LinkedInConnectWatch | null,
) {
  return useQuery({
    queryKey: queryKeys.linkedInConnection(),
    queryFn: ({ signal }) => tauriLinkedIn.connection(signal),
    enabled,
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: "always",
    refetchInterval: (query) =>
      linkedInConnectPollMs(watch, query.state.data, Date.now()),
  });
}

export function useLinkedInActions() {
  const qc = useQueryClient();
  const markDisconnected = useCallback(() => {
    qc.setQueryData<LinkedInConnection>(queryKeys.linkedInConnection(), {
      connected: false,
    });
  }, [qc]);
  const recheck = useCallback(
    () => qc.invalidateQueries({ queryKey: queryKeys.linkedInConnection() }),
    [qc],
  );
  const disconnect = useMutation({
    mutationFn: () => tauriLinkedIn.disconnect(),
    onSuccess: markDisconnected,
  });
  return { markDisconnected, recheck, disconnect };
}
