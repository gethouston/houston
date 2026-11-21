import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { analytics } from "../../lib/analytics";
import { reserveBrowserTab } from "../../lib/browser-tab";
import { logAndReportError } from "../../lib/error-report";
import { osFocusWindow, osIsTauri } from "../../lib/os-bridge";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations, tauriSystem } from "../../lib/tauri";
import {
  connectFlowRegistry,
  useConnectFlowStore,
} from "../../stores/connect-flow";
import { useConnectAnnounce } from "./connect-announce";
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
import {
  connectFlowKey,
  connectFlowScope,
  scopedBySlug,
} from "./connect-flow-scope";
import { useMintConnectLink } from "./connect-mint-link";
import { createWaker, INTEGRATION_PROVIDER } from "./model";

export type { ConnectAttempt, ConnectFlow } from "./connect-flow-registry";
export type { ConnectNotice, ConnectStep } from "./connect-flow-run";

export function useConnectFlow(opts: { agentId?: string }): ConnectFlow {
  const { agentId } = opts;
  const qc = useQueryClient();
  const scope = connectFlowScope(agentId);
  const allStates = useConnectFlowStore((s) => s.states);
  const allNotices = useConnectFlowStore((s) => s.notices);
  const allOrigins = useConnectFlowStore((s) => s.origins);
  const setOrigin = useConnectFlowStore((s) => s.setOrigin);
  const setStep = useConnectFlowStore((s) => s.setStep);
  const setNotice = useConnectFlowStore((s) => s.setNotice);
  const { announce } = useConnectAnnounce();
  const mintLink = useMintConnectLink(agentId);
  const states = useMemo(
    () => scopedBySlug(allStates, scope),
    [allStates, scope],
  );
  const notices = useMemo(
    () => scopedBySlug(allNotices, scope),
    [allNotices, scope],
  );
  const origins = useMemo(
    () => scopedBySlug(allOrigins, scope),
    [allOrigins, scope],
  );

  const connect = useCallback(
    async (toolkit: string, origin: string): Promise<ConnectAttempt> => {
      const key = connectFlowKey(scope, toolkit);
      const running = flowPromise(connectFlowRegistry, key);
      if (running) return { outcome: await running, initiated: false };

      const waker = createWaker();
      const entry = beginFlow(connectFlowRegistry, key, waker);
      if (entry === null) return { outcome: null, initiated: false };
      setOrigin(key, origin);
      const tab = osIsTauri() ? null : reserveBrowserTab();

      const deps: ConnectRunDeps = {
        entry,
        mintLink,
        openUrl: async (url) => {
          if (await tab?.navigate(url)) return true;
          const opened = await tauriSystem.openUrl(url);
          if (!opened) {
            analytics.track("integration_connect_tab_blocked", {
              integration_slug: toolkit,
            });
          }
          return opened;
        },
        readConnection: (connectionId) =>
          tauriIntegrations.connection(INTEGRATION_PROVIDER, connectionId),
        setStep: (slug, step) => setStep(connectFlowKey(scope, slug), step),
        setNotice: (slug, notice) =>
          setNotice(connectFlowKey(scope, slug), notice),
        invalidate: () =>
          qc.invalidateQueries({
            queryKey: queryKeys.integrationConnections(INTEGRATION_PROVIDER),
          }),
        focus: () => osFocusWindow(),
        announce,
        release: (slug) => {
          tab?.discard();
          endFlow(connectFlowRegistry, connectFlowKey(scope, slug));
        },
        wait: (ms) => waker.wait(ms),
        sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
        report: logAndReportError,
      };

      const run = runConnectFlow(toolkit, deps);
      entry.promise = run;
      return { outcome: await run, initiated: true };
    },
    [announce, mintLink, qc, scope, setNotice, setOrigin, setStep],
  );

  const reopen = useCallback(
    async (toolkit: string) => {
      const key = connectFlowKey(scope, toolkit);
      const url = flowRedirectUrl(connectFlowRegistry, key);
      if (!url) return;
      const opened = await tauriSystem.openUrl(url);
      if (opened && flowRedirectUrl(connectFlowRegistry, key) !== null) {
        setStep(key, "waiting");
      }
    },
    [scope, setStep],
  );

  const checkNow = useCallback(
    (toolkit: string) => {
      wakeFlow(connectFlowRegistry, connectFlowKey(scope, toolkit));
    },
    [scope],
  );

  const cancel = useCallback(
    (toolkit: string) => {
      cancelFlow(connectFlowRegistry, connectFlowKey(scope, toolkit));
    },
    [scope],
  );

  return { states, notices, origins, connect, reopen, checkNow, cancel };
}
