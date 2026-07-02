import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetAgentGrants } from "../../hooks/queries";
import { showErrorToast } from "../../lib/error-toast";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations, tauriSystem } from "../../lib/tauri";
import {
  INTEGRATION_PROVIDER,
  POLL_INTERVAL_MS,
  pollConnectionUntilActive,
} from "./integrations-tab-model";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The connect/reconnect hand-off, extracted from the tab: mint the hosted link,
 * open the browser, poll until the OAuth finishes, then invalidate. Connect and
 * reconnect are the same flow. In multiplayer, a fresh connection is auto-granted
 * to the current agent (C4 state 3: the user connected it FROM this agent's tab).
 * Every engine call routes through `call()` (toasts + reports failures); we
 * surface the two outcomes it can't see — a timed-out (abandoned) flow and a
 * provider-side OAuth failure.
 */
export function useIntegrationConnect(opts: {
  agentId: string;
  multiplayer: boolean;
  grantSet: ReadonlySet<string>;
}): {
  connectingToolkit: string | null;
  connect: (toolkit: string) => Promise<void>;
} {
  const { agentId, multiplayer, grantSet } = opts;
  const { t } = useTranslation("integrations");
  const qc = useQueryClient();
  const setGrants = useSetAgentGrants(agentId);
  const [connectingToolkit, setConnectingToolkit] = useState<string | null>(
    null,
  );

  // Stop the poll loop if the user leaves the tab mid-flow.
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const connect = useCallback(
    async (toolkit: string) => {
      setConnectingToolkit(toolkit);
      try {
        const { redirectUrl, connectionId } = await tauriIntegrations.connect(
          INTEGRATION_PROVIDER,
          toolkit,
        );
        await tauriSystem.openUrl(redirectUrl);
        const outcome = await pollConnectionUntilActive({
          poll: () =>
            tauriIntegrations.connection(INTEGRATION_PROVIDER, connectionId),
          sleep,
          isCancelled: () => cancelled.current,
          intervalMs: POLL_INTERVAL_MS,
        });
        // Multiplayer, connected from this agent's tab → auto-grant it here so
        // the row lands under "This agent can use", not "Your other connected
        // apps". PUT the grant BEFORE invalidating. `mutateAsync` routes through
        // `call()`, so a failure surfaces + re-throws into the catch below (the
        // connection still shows; the grant just didn't take).
        if (outcome === "active" && multiplayer && !grantSet.has(toolkit)) {
          await setGrants.mutateAsync([...grantSet, toolkit]);
        }
        // Whatever happened, show the real state — a failed OAuth surfaces as
        // an error row with a Reconnect action, not a silently missing app.
        await qc.invalidateQueries({
          queryKey: queryKeys.integrationConnections(INTEGRATION_PROVIDER),
        });
        if (outcome === "timeout") {
          showErrorToast(
            "integration_connect_timeout",
            t("connectResult.timeout"),
          );
        } else if (outcome === "error") {
          showErrorToast(
            "integration_connect_failed",
            t("connectResult.failed"),
          );
        }
      } catch {
        // The failing engine call (connect / open-url / poll / grant) already
        // surfaced via `call()`. Swallow the re-throw so the click handler never
        // leaks an unhandled rejection.
      } finally {
        if (!cancelled.current) setConnectingToolkit(null);
      }
    },
    [qc, t, multiplayer, grantSet, setGrants],
  );

  return { connectingToolkit, connect };
}
