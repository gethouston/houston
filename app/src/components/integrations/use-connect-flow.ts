import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
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
import { useMintConnectLink } from "./connect-mint-link";
import { createWaker, INTEGRATION_PROVIDER } from "./model";

// The public flow contract (`ConnectStep`, `ConnectFlow`) lives with the
// registry and runner it describes; re-exported here so importers are unchanged.
export type { ConnectAttempt, ConnectFlow } from "./connect-flow-registry";
export type { ConnectNotice, ConnectStep } from "./connect-flow-run";

/**
 * The connect / reconnect hand-off. It binds this surface to the ONE shared
 * flow state (`stores/connect-flow.ts`) rather than owning a private copy, so:
 *
 *  - a connect started in chat is the SAME flow the Integrations page renders,
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
  const qc = useQueryClient();
  const states = useConnectFlowStore((s) => s.states);
  const notices = useConnectFlowStore((s) => s.notices);
  const origins = useConnectFlowStore((s) => s.origins);
  const setOrigin = useConnectFlowStore((s) => s.setOrigin);
  const setStep = useConnectFlowStore((s) => s.setStep);
  const setNotice = useConnectFlowStore((s) => s.setNotice);
  const { announce } = useConnectAnnounce();
  const mintLink = useMintConnectLink(agentId);

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
      // Claim the OAuth tab NOW, still inside the click's user activation: the
      // link is minted over an async hop, and Safari, Firefox, and Chrome's
      // strict popup setting refuse a `window.open` issued after it, leaving
      // the row "waiting" on a page the user never saw (PRODUCT-1625). Desktop
      // opens URLs natively and never reserves. A refused reservation (a
      // connect started outside any gesture) falls through to the plain open,
      // whose own verdict decides between `waiting` and `blocked`.
      const tab = osIsTauri() ? null : reserveBrowserTab();

      const deps: ConnectRunDeps = {
        entry,
        mintLink,
        openUrl: async (url) => {
          if (tab?.navigate(url)) return true;
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
        setStep,
        setNotice,
        invalidate: () =>
          qc.invalidateQueries({
            queryKey: queryKeys.integrationConnections(INTEGRATION_PROVIDER),
          }),
        // The user finished the app's sign-in in their browser — surface
        // Houston over it (no-op on web, where there is no OS window to raise).
        focus: () => osFocusWindow(),
        announce,
        release: (slug) => {
          // An empty tab whose link never came (mint failed, cancelled while
          // minting) must not linger; a navigated one is the OAuth page.
          tab?.discard();
          endFlow(connectFlowRegistry, slug);
        },
        wait: (ms) => waker.wait(ms),
        sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
        report: logAndReportError,
      };

      const run = runConnectFlow(toolkit, deps);
      entry.promise = run;
      return { outcome: await run, initiated: true };
    },
    [announce, mintLink, qc, setNotice, setOrigin, setStep],
  );

  const reopen = useCallback(
    async (toolkit: string) => {
      const url = flowRedirectUrl(connectFlowRegistry, toolkit);
      if (!url) return;
      const opened = await tauriSystem.openUrl(url);
      // A reopen IS a click, so it passes the popup blocker that refused the
      // first open: once the browser takes the URL the row is genuinely
      // waiting on the provider page. Guarded on the flow still being live so
      // a reopen racing its own settle never resurrects a finished slug (the
      // runner releases the slug and clears the step in one synchronous
      // `finally`).
      if (opened && flowRedirectUrl(connectFlowRegistry, toolkit) !== null) {
        setStep(toolkit, "waiting");
      }
    },
    [setStep],
  );

  const checkNow = useCallback((toolkit: string) => {
    wakeFlow(connectFlowRegistry, toolkit);
  }, []);

  const cancel = useCallback((toolkit: string) => {
    cancelFlow(connectFlowRegistry, toolkit);
  }, []);

  return { states, notices, origins, connect, reopen, checkNow, cancel };
}
