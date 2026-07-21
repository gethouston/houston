import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { showErrorToast } from "../../lib/error-toast";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations, tauriSystem } from "../../lib/tauri";
import {
  beginFlow,
  type ConnectFlow,
  type ConnectStep,
  cancelAllFlows,
  cancelFlow,
  createRegistry,
  endFlow,
  type FlowRegistry,
  flowRedirectUrl,
  wakeFlow,
} from "./connect-flow-registry";
import {
  createWaker,
  INTEGRATION_PROVIDER,
  POLL_INTERVAL_MS,
  pollConnectionUntilActive,
} from "./model";

// The public flow contract (`ConnectStep`, `ConnectFlow`) lives with the
// registry it describes; re-exported here so existing importers are unchanged.
export type { ConnectFlow, ConnectStep } from "./connect-flow-registry";

/**
 * The connect / reconnect hand-off, owned by the SURFACE (not the picker dialog)
 * so closing the dialog never kills polling: mint the hosted link, open the
 * browser, poll until the OAuth finishes, then invalidate connections. In agent
 * context the agent slug is forwarded so the gateway enforces the agent's
 * effective allowlist on connect.
 *
 * Flows are PER TOOLKIT and concurrent. Each live connect owns one registry
 * entry ({@link FlowRegistry}) holding its `Waker`, cancel flag, and redirect
 * URL, plus one key in the mirrored `states` React state; its `finally` frees
 * only its own slug. `checkNow`/`reopen`/`cancel` address exactly one toolkit,
 * so cancelling app A never stops app B, and surface unmount cancels ALL flows.
 *
 * The poll's inter-attempt sleep is backed by a per-flow `Waker`, so
 * `checkNow(slug)` wakes it immediately and `cancel(slug)` wakes it to observe
 * cancellation on the next tick. Every engine call routes through `call()`
 * (toasts + reports failures); we surface the two outcomes it can't see — a
 * timed-out (abandoned) flow and a provider-side OAuth failure. A cancel is
 * silent by design.
 */
export function useConnectFlow(opts: { agentId?: string }): ConnectFlow {
  const { agentId } = opts;
  const { t } = useTranslation("integrations");
  const qc = useQueryClient();
  const [states, setStates] = useState<Record<string, ConnectStep>>({});

  const unmountedRef = useRef(false);
  const registryRef = useRef<FlowRegistry | null>(null);
  if (registryRef.current === null) registryRef.current = createRegistry();
  const registry = registryRef.current;

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      // Surface unmount cancels every loop (leave the tab), same as before.
      unmountedRef.current = true;
      cancelAllFlows(registry);
    };
  }, [registry]);

  // Mirror one slug's step into React state (or clear it), skipping post-unmount
  // updates and no-op writes so the mirror never re-renders needlessly.
  const setStep = useCallback((toolkit: string, step: ConnectStep | null) => {
    if (unmountedRef.current) return;
    setStates((prev) => {
      if (step === null) {
        if (!(toolkit in prev)) return prev;
        const { [toolkit]: _dropped, ...rest } = prev;
        return rest;
      }
      if (prev[toolkit] === step) return prev;
      return { ...prev, [toolkit]: step };
    });
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
      // Per-slug single flight: a live flow for THIS toolkit already owns its
      // registry entry (waker / redirect url) and poll loop. Starting a second
      // connect for the same app — e.g. the detail sheet's Reconnect over a
      // still-running picker connect — would overwrite them and leave the first
      // loop polling invisibly. A DIFFERENT toolkit gets its own entry and runs
      // concurrently. This guard is the real enforcement for every entry point.
      const waker = createWaker();
      const entry = beginFlow(registry, toolkit, waker);
      if (entry === null) return null;
      setStep(toolkit, "starting");
      try {
        // Agent context: pass the agent slug so the gateway enforces the
        // agent's effective allowlist on connect (Teams v2). Undefined on the
        // account-level Integrations page.
        const { redirectUrl, connectionId } = await tauriIntegrations.connect(
          INTEGRATION_PROVIDER,
          toolkit,
          agentId,
        );
        entry.redirectUrl = redirectUrl;
        // A cancel that landed while the link was still minting ("starting")
        // must NOT go on to pop the OAuth tab. Bail before opening the browser,
        // returning the same silent "cancelled" outcome the poll loop yields.
        if (entry.cancelled) return "cancelled";
        await tauriSystem.openUrl(redirectUrl);
        setStep(toolkit, "waiting");

        const outcome = await pollConnectionUntilActive({
          poll: () =>
            tauriIntegrations.connection(INTEGRATION_PROVIDER, connectionId),
          sleep: (ms) => waker.wait(ms),
          isCancelled: () => entry.cancelled,
          intervalMs: POLL_INTERVAL_MS,
        });

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
        endFlow(registry, toolkit);
        setStep(toolkit, null);
      }
    },
    [agentId, invalidateConnections, registry, setStep, t],
  );

  const reopen = useCallback(
    async (toolkit: string) => {
      const url = flowRedirectUrl(registry, toolkit);
      if (url) await tauriSystem.openUrl(url);
    },
    [registry],
  );

  const checkNow = useCallback(
    async (toolkit: string) => {
      wakeFlow(registry, toolkit);
    },
    [registry],
  );

  const cancel = useCallback(
    (toolkit: string) => {
      cancelFlow(registry, toolkit);
    },
    [registry],
  );

  return { states, connect, reopen, checkNow, cancel };
}
