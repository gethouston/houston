import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProviderConnections } from "../../../hooks/use-provider-connections";
import { logAndReportError } from "../../../lib/error-report";
import type { ProviderInfo } from "../../../lib/providers";
import { optimisticConnectionState } from "./optimistic-connection";

export function useOptimisticConnections(
  connections: ProviderConnections,
  probeSettled: boolean,
): ProviderConnections {
  const [waiting, setWaiting] = useState<ProviderInfo | null>(null);
  const live = useRef(connections);
  live.current = connections;

  useEffect(() => {
    if (!probeSettled) return;
    live.current
      .refresh()
      .catch((error: unknown) =>
        logAndReportError("onboarding_connect_refresh", error),
      );
  }, [probeSettled]);

  useEffect(() => {
    if (!probeSettled || waiting === null) return;
    setWaiting(null);
    if (live.current.connectionState(waiting) !== "connected")
      live.current.connect(waiting);
  }, [probeSettled, waiting]);

  const connectionState = useCallback(
    (provider: ProviderInfo) =>
      optimisticConnectionState(
        connections.connectionState(provider),
        probeSettled,
      ),
    [connections, probeSettled],
  );
  const connect = useCallback(
    (provider: ProviderInfo) => {
      if (probeSettled) connections.connect(provider);
      else setWaiting(provider);
    },
    [connections, probeSettled],
  );
  const cancel = useCallback(
    async (provider: ProviderInfo) => {
      if (waiting?.id === provider.id) setWaiting(null);
      else await connections.cancel(provider);
    },
    [connections, waiting],
  );

  return useMemo(
    () => ({
      ...connections,
      connectionState,
      connect,
      cancel,
      busy: waiting
        ? { ...connections.busy, [waiting.id]: "connecting" as const }
        : connections.busy,
    }),
    [connections, connectionState, connect, cancel, waiting],
  );
}
