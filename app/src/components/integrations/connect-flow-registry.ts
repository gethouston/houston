import type { ConnectNotice, ConnectStep } from "./connect-flow-run";
import type { PollOutcome, Waker } from "./model";

export interface ConnectFlow {
  /**
   * Toolkit slug -> its live step. An empty record means nothing is in flight;
   * a slug is present only while ITS connect is running, so a surface reads
   * `slug in states` for the ONE row it is rendering. It is deliberately NOT a
   * "something is busy" flag: connects run in parallel and every other row
   * stays fully interactive.
   */
  states: Record<string, ConnectStep>;
  /**
   * Toolkit slug -> the outcome its just-settled flow left behind, held for a
   * few seconds so the row the user clicked confirms in place ("connected" /
   * "failed" / "stopped") instead of silently snapping back. Cleared on its own
   * timer, and immediately when that slug starts connecting again.
   */
  notices: Record<string, ConnectNotice>;
  /**
   * Toolkit slug -> the {@link ConnectAttempt} origin key of the row its flow
   * was started from. A surface that renders the same app more than once (the
   * catalog's "Most used" spotlight repeats category rows) compares its row's
   * own key against this to decide which single copy owns the expansion.
   */
  origins: Record<string, string>;
  /**
   * Start (or reconnect) `toolkit` from the row identified by `origin`.
   *
   * Resolves with the poll outcome so callers can react to a LANDED connection
   * (the chat connect card nudges the agent on `"active"`); `outcome` is `null`
   * when the flow failed before/while polling (already surfaced via `call()`).
   * A slug that ALREADY owns a flow JOINS it — the same promise, the same
   * outcome, `initiated: false` — so a second surface asking for the same app
   * never starts a rival hand-off (per-slug single-flight, global) and never
   * repeats the side effects the STARTER owes (analytics, the agent nudge). A
   * DIFFERENT app connects concurrently.
   */
  connect: (toolkit: string, origin: string) => Promise<ConnectAttempt>;
  /** Reopen the SAME OAuth page for one toolkit (the user closed the tab). */
  reopen: (toolkit: string) => Promise<void>;
  /** Wake one toolkit's poll loop to check the connection right now. */
  checkNow: (toolkit: string) => void;
  /** Stop one toolkit's loop with no toast; leaves the others running. */
  cancel: (toolkit: string) => void;
}

/** What one `connect()` call yields: the flow's outcome, plus whether THIS call
 *  started it (rather than joining one already running). */
export interface ConnectAttempt {
  outcome: PollOutcome | null;
  /** `true` only for the caller whose click actually began the hand-off. */
  initiated: boolean;
}

/**
 * One in-flight connect flow's mutable, render-independent state. Lives in a
 * ref (never React state) so waking the poll, flipping cancellation, or reading
 * back the redirect URL never triggers a re-render — the visible per-slug step
 * is mirrored separately as React state on the hook.
 */
export interface FlowEntry {
  /** Wakes this flow's inter-attempt sleep (checkNow) or observes cancel. */
  waker: Waker;
  /** Read before every poll wait/tick so cancel stops THIS loop only. */
  cancelled: boolean;
  /** The hosted OAuth link, so "Reopen" can reopen the same page. */
  redirectUrl: string | null;
  /** This flow's run, so a second surface asking for the same app JOINS it
   *  (and observes the same outcome) instead of being turned away. Assigned
   *  synchronously right after {@link beginFlow}, before any await. */
  promise: Promise<PollOutcome | null> | null;
}

/**
 * Toolkit slug -> its live flow. Concurrent connects each own one entry, so a
 * cancel, wake, or redirect read addresses exactly one flow and never touches
 * its siblings. Deleting an entry (its flow's `finally`) frees only that slug.
 *
 * ONE registry exists per app run (`app/src/stores/connect-flow.ts`), shared by
 * every surface: a connect started in chat is the same flow the Integrations
 * page shows, and leaving a surface never kills a poll the user still wants.
 */
export type FlowRegistry = Map<string, FlowEntry>;

export function createRegistry(): FlowRegistry {
  return new Map();
}

/**
 * Claim `toolkit` for a new flow. Returns the fresh entry, or `null` when that
 * slug already owns a flow — the per-slug single-flight guard: a second connect
 * for the same app is a no-op, while a DIFFERENT app connects concurrently.
 */
export function beginFlow(
  reg: FlowRegistry,
  toolkit: string,
  waker: Waker,
): FlowEntry | null {
  if (reg.has(toolkit)) return null;
  const entry: FlowEntry = {
    waker,
    cancelled: false,
    redirectUrl: null,
    promise: null,
  };
  reg.set(toolkit, entry);
  return entry;
}

/** The live run for ONE slug, or `null` when that slug has no flow — the
 *  cross-surface single-flight join point. */
export function flowPromise(
  reg: FlowRegistry,
  toolkit: string,
): Promise<PollOutcome | null> | null {
  return reg.get(toolkit)?.promise ?? null;
}

/** Release the slug once its flow settles (success, cancel, timeout, error). */
export function endFlow(reg: FlowRegistry, toolkit: string): void {
  reg.delete(toolkit);
}

/** Cancel ONE flow: flag it and wake its poll to observe the flag at once. */
export function cancelFlow(reg: FlowRegistry, toolkit: string): void {
  const entry = reg.get(toolkit);
  if (!entry) return;
  entry.cancelled = true;
  entry.waker.wake();
}

/** Wake ONE flow's poll to check right now ("I have finished"). */
export function wakeFlow(reg: FlowRegistry, toolkit: string): void {
  reg.get(toolkit)?.waker.wake();
}

/** The hosted link for ONE flow, or `null` if that slug has no live flow. */
export function flowRedirectUrl(
  reg: FlowRegistry,
  toolkit: string,
): string | null {
  return reg.get(toolkit)?.redirectUrl ?? null;
}
