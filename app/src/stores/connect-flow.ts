import { create } from "zustand";
import {
  cancelFlow,
  createRegistry,
} from "../components/integrations/connect-flow-registry.ts";
import type {
  ConnectNotice,
  ConnectStep,
} from "../components/integrations/connect-flow-run.ts";

/**
 * The ONE connect-flow state for the whole app.
 *
 * Every surface that can start an OAuth hand-off (the Integrations page, the
 * per-agent tab, the in-chat connect cards, onboarding, the automation intake)
 * used to own a private registry, so a connect started in chat was invisible on
 * the Integrations tab and the same app could be handed off twice at once.
 * Lifting both halves here fixes that:
 *
 *  - {@link connectFlowRegistry} — the render-independent half (waker, cancel
 *    flag, redirect URL, the run's promise), a module singleton so per-toolkit
 *    single-flight holds ACROSS surfaces and a poll outlives the surface that
 *    started it. Navigating away no longer cancels anything: only the user's
 *    explicit Cancel does, and the poll is capped at ~5 minutes
 *    (`POLL_MAX_ATTEMPTS`) so an abandoned flow can never leak forever.
 *  - the store below — the render half every surface subscribes to.
 */
export const connectFlowRegistry = createRegistry();

/** How long a settled flow's outcome stays on the row it started from. */
export const CONNECT_NOTICE_MS = 6000;

interface ConnectFlowState {
  /** Toolkit slug -> its live phase. Present only while that flow runs. */
  states: Record<string, ConnectStep>;
  /** Toolkit slug -> the outcome its last flow settled on (self-expiring). */
  notices: Record<string, ConnectNotice>;
  /**
   * Toolkit slug -> the ORIGIN key of the row that started its flow, supplied
   * by whoever called `connect()`.
   *
   * The catalog deliberately renders some apps TWICE (the curated "Most used"
   * spotlight repeats rows that also live in their category section), so
   * "expand the row for this slug" would expand two rows and duplicate both the
   * panel and its live region. The origin is the tiebreak: exactly one row —
   * the one the user actually pressed — owns the expansion, while every other
   * copy keeps only the compact per-slug spinner. Lives as long as the flow's
   * visible lifecycle: it dies with a flow that leaves no outcome (a cancel),
   * and otherwise with the notice it belongs to.
   */
  origins: Record<string, string>;
  /** Record which row a flow was started from (see {@link origins}). */
  setOrigin: (toolkit: string, origin: string) => void;
  /** Publish (or clear) one slug's live phase. */
  setStep: (toolkit: string, step: ConnectStep | null) => void;
  /**
   * Publish (or clear) one slug's settled outcome. A published notice expires
   * on its own after {@link CONNECT_NOTICE_MS} so the confirmation never
   * becomes permanent furniture; a fresh connect for the same slug clears it
   * immediately (the runner clears before it publishes `starting`).
   */
  setNotice: (toolkit: string, notice: ConnectNotice | null) => void;
  /**
   * Stop EVERY live flow silently (per-flow `cancel` semantics) and drop the
   * settled residue. For identity changes only: an active-space switch or a
   * sign-out. A poll started under the previous identity would keep running
   * with the NEW `x-houston-org` header and answer for the wrong tenant —
   * a red toast about an app the new space never connected, a success toast
   * across spaces, an invalidation into a just-wiped cache.
   */
  cancelAllConnectFlows: () => void;
}

/** Live expiry timers, keyed by slug — render-independent, so not in state. */
const noticeTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearNoticeTimer(toolkit: string): void {
  const handle = noticeTimers.get(toolkit);
  if (handle === undefined) return;
  clearTimeout(handle);
  noticeTimers.delete(toolkit);
}

/** Drop one key from a slug-keyed record, reusing the identity when absent so
 *  clearing a slug that carries nothing never re-renders a subscriber. */
function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map;
  const { [key]: _dropped, ...rest } = map;
  return rest;
}

export const useConnectFlowStore = create<ConnectFlowState>()((set) => ({
  states: {},
  notices: {},
  origins: {},

  setOrigin: (toolkit, origin) =>
    set((prev) =>
      prev.origins[toolkit] === origin
        ? prev
        : { origins: { ...prev.origins, [toolkit]: origin } },
    ),

  setStep: (toolkit, step) =>
    set((prev) => {
      if (step === null) {
        const states = without(prev.states, toolkit);
        if (states === prev.states) return prev;
        // The flow is over. A flow that left NO outcome on the row (a cancel)
        // takes its origin with it; one that settled keeps it until its notice
        // expires, so the row the user pressed is also the row that confirms.
        // The runner publishes the notice BEFORE clearing the step for exactly
        // this reason.
        return toolkit in prev.notices
          ? { states }
          : { states, origins: without(prev.origins, toolkit) };
      }
      if (prev.states[toolkit] === step) return prev;
      return { states: { ...prev.states, [toolkit]: step } };
    }),

  setNotice: (toolkit, notice) => {
    clearNoticeTimer(toolkit);
    if (notice === null) {
      set((prev) => ({ notices: without(prev.notices, toolkit) }));
      return;
    }
    set((prev) => ({ notices: { ...prev.notices, [toolkit]: notice } }));
    noticeTimers.set(
      toolkit,
      setTimeout(() => {
        noticeTimers.delete(toolkit);
        set((prev) => ({
          notices: without(prev.notices, toolkit),
          origins: without(prev.origins, toolkit),
        }));
      }, CONNECT_NOTICE_MS),
    );
  },

  cancelAllConnectFlows: () => {
    // Silent, like the per-flow Cancel: each loop observes the flag on its next
    // tick and unwinds through its own `finally` (clearing its `states` entry),
    // so no request is ever issued under the new identity.
    for (const toolkit of [...connectFlowRegistry.keys()]) {
      cancelFlow(connectFlowRegistry, toolkit);
    }
    for (const handle of noticeTimers.values()) clearTimeout(handle);
    noticeTimers.clear();
    set((prev) =>
      Object.keys(prev.notices).length === 0 &&
      Object.keys(prev.origins).length === 0
        ? prev
        : { notices: {}, origins: {} },
    );
  },
}));

/**
 * {@link ConnectFlowState.cancelAllConnectFlows} for the non-React callers that
 * own the identity switch: the active-space reset (`lib/space-cache.ts`) and
 * `signOut()` (`lib/auth.ts`).
 */
export function cancelAllConnectFlows(): void {
  useConnectFlowStore.getState().cancelAllConnectFlows();
}
