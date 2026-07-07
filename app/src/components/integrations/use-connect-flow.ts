import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentGrantMutation } from "../../hooks/queries";
import { showErrorToast } from "../../lib/error-toast";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations, tauriSystem } from "../../lib/tauri";
import {
  createWaker,
  INTEGRATION_PROVIDER,
  POLL_INTERVAL_MS,
  type PollOutcome,
  pollConnectionUntilActive,
  type Waker,
} from "./model";

/** Which toolkit is connecting, and whether the browser hand-off has started. */
export type ConnectState = {
  toolkit: string;
  step: "starting" | "waiting";
} | null;

export interface ConnectFlow {
  state: ConnectState;
  /**
   * Resolves with the poll outcome so callers can react to a LANDED
   * connection (the chat connect card nudges the agent on "active"); `null`
   * when the flow failed before/while polling (already surfaced via `call()`)
   * or when another connect already owns the flow.
   */
  connect: (toolkit: string) => Promise<PollOutcome | null>;
  /** Reopen the SAME OAuth page (the user closed the tab too early). */
  reopen: () => Promise<void>;
  /** Wake the poll loop to check the connection right now. */
  checkNow: () => void;
  /** Stop the loop with no toast; the pending recovery UI is the way back. */
  cancel: () => void;
}

/**
 * The connect / reconnect hand-off, owned by the SURFACE (not the picker dialog)
 * so closing the dialog never kills polling: mint the hosted link, open the
 * browser, poll until the OAuth finishes, then invalidate connections. In agent
 * context a fresh connection is auto-granted to the current agent.
 *
 * The poll's inter-attempt sleep is backed by a `Waker`, so `checkNow()` wakes
 * it immediately and `cancel()` wakes it to observe cancellation on the next
 * tick. Every engine call routes through `call()` (toasts + reports failures);
 * we surface the two outcomes it can't see — a timed-out (abandoned) flow and a
 * provider-side OAuth failure. A cancel is silent by design.
 */
export function useConnectFlow(opts: {
  agentId?: string;
  autoGrant: boolean;
}): ConnectFlow {
  const { agentId, autoGrant } = opts;
  const { t } = useTranslation("integrations");
  const qc = useQueryClient();
  const { mutateAsync: mutateGrant } = useAgentGrantMutation(agentId ?? "");
  const [state, setState] = useState<ConnectState>(null);

  const cancelledRef = useRef(false);
  const unmountedRef = useRef(false);
  const wakerRef = useRef<Waker | null>(null);
  const redirectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      // Surface unmount cancels the loop (leave the tab), same as before.
      unmountedRef.current = true;
      cancelledRef.current = true;
      wakerRef.current?.wake();
    };
  }, []);

  const invalidateConnections = useCallback(
    () =>
      qc.invalidateQueries({
        queryKey: queryKeys.integrationConnections(INTEGRATION_PROVIDER),
      }),
    [qc],
  );

  const connect = useCallback(
    async (toolkit: string) => {
      // Single flight: a flow already owns the single-slot refs (waker /
      // redirect url) and the poll loop. Starting a second connect — e.g. the
      // detail sheet's Reconnect over a still-running picker connect — would
      // overwrite those refs and leave the first loop polling invisibly. The
      // picker + callouts disable their buttons on `state`, but this guard is
      // the real enforcement for every entry point.
      if (wakerRef.current) return null;
      cancelledRef.current = false;
      const waker = createWaker();
      wakerRef.current = waker;
      setState({ toolkit, step: "starting" });
      try {
        // Agent context: pass the agent slug so the gateway enforces the
        // agent's effective allowlist and auto-grants the toolkit on connect
        // (Teams v2). Undefined on the account-level Integrations page.
        const { redirectUrl, connectionId } = await tauriIntegrations.connect(
          INTEGRATION_PROVIDER,
          toolkit,
          agentId,
        );
        redirectUrlRef.current = redirectUrl;
        await tauriSystem.openUrl(redirectUrl);
        if (!unmountedRef.current) setState({ toolkit, step: "waiting" });

        const outcome = await pollConnectionUntilActive({
          poll: () =>
            tauriIntegrations.connection(INTEGRATION_PROVIDER, connectionId),
          sleep: (ms) => waker.wait(ms),
          isCancelled: () => cancelledRef.current,
          intervalMs: POLL_INTERVAL_MS,
        });

        // Agent context, connected from this agent → auto-grant so the app lands
        // as active for it. The grant mutation computes the next set from the
        // FRESHEST cache at mutate time and no-ops when grants are unsupported;
        // its failure surfaces via call() but must NOT mask the connection.
        if (outcome === "active" && autoGrant && agentId) {
          try {
            await mutateGrant({ toolkit, op: "add" });
          } catch {
            // Surfaced by call(); the connection itself still succeeded.
          }
        }
        await invalidateConnections();

        if (outcome === "timeout") {
          showErrorToast(
            "integration_connect_timeout",
            "integration connect timed out",
            undefined,
            { userMessage: t("connectResult.timeout") },
          );
        } else if (outcome === "error") {
          showErrorToast(
            "integration_connect_failed",
            "integration connect failed",
            undefined,
            { userMessage: t("connectResult.failed") },
          );
        }
        // outcome === "cancelled": no toast; the server connection may stay
        // pending and the pending recovery UI is the way back.
        return outcome;
      } catch {
        // The failing engine call already surfaced via call(). Swallow the
        // re-throw so the click handler never leaks an unhandled rejection.
        return null;
      } finally {
        wakerRef.current = null;
        if (!unmountedRef.current) setState(null);
      }
    },
    [agentId, autoGrant, invalidateConnections, mutateGrant, t],
  );

  const reopen = useCallback(async () => {
    if (redirectUrlRef.current) {
      await tauriSystem.openUrl(redirectUrlRef.current);
    }
  }, []);

  const checkNow = useCallback(() => {
    wakerRef.current?.wake();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    wakerRef.current?.wake();
  }, []);

  return { state, connect, reopen, checkNow, cancel };
}
