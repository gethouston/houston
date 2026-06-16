import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tauriConnections, tauriSystem } from "../lib/tauri";
import { queryKeys } from "../lib/query-keys";
import { isAlreadyConnectedError } from "../lib/composio-already-connected";
import { useComposioRefetchOnReturn } from "./use-composio-refetch-on-return";

/**
 * Shared Composio "Connect" action for every surface that starts an OAuth
 * link by opening the browser (Integrations tab Browse list, onboarding
 * AI-integrations step).
 *
 * Owns the per-toolkit `connecting` spinner state and the already-connected
 * recovery: when the engine rejects a Connect because the toolkit is already
 * linked (`composio_already_connected`), the local connected-toolkits cache
 * was stale, which is why the button stayed live and let the user re-trigger
 * the same conflict. We invalidate that query so it refetches and the card
 * flips to its connected state (HOU-463). Any other failure already surfaced
 * via the engine-call toast.
 */
export function useComposioConnect(): {
  connecting: string | null;
  connect: (toolkit: string) => Promise<void>;
} {
  const qc = useQueryClient();
  const markWaitingForAuth = useComposioRefetchOnReturn();
  const [connecting, setConnecting] = useState<string | null>(null);

  const connect = useCallback(
    async (toolkit: string) => {
      setConnecting(toolkit);
      try {
        const { redirect_url } = await tauriConnections.connectApp(toolkit);
        tauriSystem.openUrl(redirect_url);
        markWaitingForAuth(toolkit);
      } catch (err) {
        if (isAlreadyConnectedError(err)) {
          await qc.invalidateQueries({
            queryKey: queryKeys.connectedToolkits(),
          });
        }
        // Other failures are surfaced by the engine-call wrapper as a toast.
      } finally {
        setConnecting(null);
      }
    },
    [qc, markWaitingForAuth],
  );

  return { connecting, connect };
}
