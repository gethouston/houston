import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { logAndReportError } from "../../lib/error-report";
import { isUnconnectableToolkitError } from "../../lib/integration-connect-error";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations, tauriSystem } from "../../lib/tauri";
import {
  connectFlowRegistry,
  useConnectFlowStore,
} from "../../stores/connect-flow";
import { useUIStore } from "../../stores/ui";
import { prettifyToolkit } from "./app-display";
import {
  beginFlow,
  type ConnectAttempt,
  type ConnectFlow,
  cancelFlow,
  endFlow,
  flowPromise,
  flowRedirectUrl,
  wakeFlow,
} from "./connect-flow-registry";
import { type ConnectRunDeps, runConnectFlow } from "./connect-flow-run";
import { createWaker, INTEGRATION_PROVIDER, type PollOutcome } from "./model";

// The public flow contract (`ConnectStep`, `ConnectFlow`) lives with the
// registry and runner it describes; re-exported here so importers are unchanged.
export type { ConnectAttempt, ConnectFlow } from "./connect-flow-registry";
export type { ConnectNotice, ConnectStep } from "./connect-flow-run";

/**
 * The connect / reconnect hand-off. It binds this surface to the ONE shared
 * flow state (`stores/connect-flow.ts`) rather than owning a private copy, so:
 *
 *  - a connect started in chat is the SAME flow the Integrations tab renders,
 *    and per-toolkit single-flight holds across every surface (a second caller
 *    for the same app JOINS the running flow and observes its outcome);
 *  - flows are PER TOOLKIT and genuinely concurrent — connecting Slack never
 *    disables Notion's row, on this surface or any other;
 *  - leaving a surface no longer cancels anything. The poll belongs to the
 *    user's intent, not to a mounted component; only an explicit Cancel stops
 *    it, and the ~5 minute attempt budget caps an abandoned one.
 *
 * Each live connect owns one registry entry (waker, cancel flag, redirect URL,
 * its run) plus one key in the shared `states` record; when it settles it leaves
 * a self-expiring `notices` entry so the row the user clicked confirms in place.
 * `checkNow`/`reopen`/`cancel` address exactly one toolkit.
 *
 * Every engine call routes through `call()` (toasts + reports failures); the
 * outcomes it cannot see are surfaced here, ONCE, for every surface: a landed
 * connection (success toast), an abandoned OAuth (neutral toast pointing at the
 * pending row's Finish action, NOT a crash report) and a provider-side failure
 * (error toast, no auto bug report). A cancel is silent by design.
 */
export function useConnectFlow(opts: { agentId?: string }): ConnectFlow {
  const { agentId } = opts;
  const { t } = useTranslation("integrations");
  const qc = useQueryClient();
  const states = useConnectFlowStore((s) => s.states);
  const notices = useConnectFlowStore((s) => s.notices);
  const origins = useConnectFlowStore((s) => s.origins);
  const setOrigin = useConnectFlowStore((s) => s.setOrigin);
  const setStep = useConnectFlowStore((s) => s.setStep);
  const setNotice = useConnectFlowStore((s) => s.setNotice);
  const addToast = useUIStore((s) => s.addToast);

  /** The app's real catalog name for outcome copy, never the machine slug. */
  const appName = useCallback(
    (toolkit: string) => {
      const catalog = qc.getQueryData<IntegrationToolkit[]>(
        queryKeys.integrationToolkits(INTEGRATION_PROVIDER),
      );
      return (
        catalog?.find((tk) => tk.slug === toolkit)?.name ??
        prettifyToolkit(toolkit)
      );
    },
    [qc],
  );

  const announce = useCallback(
    (toolkit: string, outcome: PollOutcome) => {
      const app = appName(toolkit);
      if (outcome === "active") {
        addToast({
          title: t("connectResult.connected", { app }),
          variant: "success",
        });
      } else if (outcome === "timeout") {
        // Walking away from an OAuth is normal behavior, not a crash: a calm,
        // neutral toast naming the way back, never a red one with a bug report.
        addToast({
          title: t("connectResult.timeoutTitle", { app }),
          description: t("connectResult.timeout", { app }),
          variant: "info",
        });
      } else if (outcome === "error") {
        addToast({
          title: t("connectResult.failedTitle", { app }),
          description: t("connectResult.failed"),
          variant: "error",
        });
      }
    },
    [addToast, appName, t],
  );

  const connect = useCallback(
    async (toolkit: string, origin: string): Promise<ConnectAttempt> => {
      // Global per-slug single flight: a live flow for THIS toolkit already owns
      // its registry entry and poll loop, so join it rather than starting a
      // rival hand-off that would overwrite the waker and leave the first loop
      // polling invisibly. A DIFFERENT toolkit gets its own entry, concurrently.
      // A joiner does NOT re-home the flow: the state stays on the row that
      // actually started it, and `initiated: false` keeps this caller from
      // repeating side effects the starter already owns.
      const running = flowPromise(connectFlowRegistry, toolkit);
      if (running) return { outcome: await running, initiated: false };

      const waker = createWaker();
      const entry = beginFlow(connectFlowRegistry, toolkit, waker);
      if (entry === null) return { outcome: null, initiated: false };
      setOrigin(toolkit, origin);

      const deps: ConnectRunDeps = {
        entry,
        // Agent context: pass the agent slug so the gateway enforces the
        // agent's effective allowlist on connect (Teams v2). Undefined on the
        // account-level Integrations page.
        //
        // An app Houston cannot offer OAuth for yet (`toolkit_oauth_unmanaged`
        // — twitter, HOU-1116) is an expected state, not a bug: `call()` keeps
        // it off Sentry and the red toast, and the copy here names the real
        // reason instead of the generic "something went wrong".
        mintLink: async (slug) => {
          try {
            return await tauriIntegrations.connect(
              INTEGRATION_PROVIDER,
              slug,
              agentId,
            );
          } catch (err) {
            if (isUnconnectableToolkitError(err)) {
              addToast({
                title: t("connectResult.unavailableTitle", {
                  app: appName(slug),
                }),
                description: t("connectResult.unavailable"),
                variant: "info",
              });
            }
            throw err;
          }
        },
        openUrl: (url) => tauriSystem.openUrl(url),
        readConnection: (connectionId) =>
          tauriIntegrations.connection(INTEGRATION_PROVIDER, connectionId),
        setStep,
        setNotice,
        invalidate: () =>
          qc.invalidateQueries({
            queryKey: queryKeys.integrationConnections(INTEGRATION_PROVIDER),
          }),
        announce,
        release: (slug) => endFlow(connectFlowRegistry, slug),
        wait: (ms) => waker.wait(ms),
        sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
        report: logAndReportError,
      };

      const run = runConnectFlow(toolkit, deps);
      entry.promise = run;
      return { outcome: await run, initiated: true };
    },
    [
      agentId,
      addToast,
      announce,
      appName,
      qc,
      setNotice,
      setOrigin,
      setStep,
      t,
    ],
  );

  const reopen = useCallback(async (toolkit: string) => {
    const url = flowRedirectUrl(connectFlowRegistry, toolkit);
    if (url) await tauriSystem.openUrl(url);
  }, []);

  const checkNow = useCallback((toolkit: string) => {
    wakeFlow(connectFlowRegistry, toolkit);
  }, []);

  const cancel = useCallback((toolkit: string) => {
    cancelFlow(connectFlowRegistry, toolkit);
  }, []);

  return { states, notices, origins, connect, reopen, checkNow, cancel };
}
