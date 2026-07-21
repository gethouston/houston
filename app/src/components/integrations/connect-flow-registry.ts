import type { PollOutcome, Waker } from "./model";

/** One toolkit's live hand-off phase: minting the link vs. polling the OAuth. */
export type ConnectStep = "starting" | "waiting";

export interface ConnectFlow {
  /**
   * Toolkit slug -> its live step. An empty record means nothing is in flight;
   * a slug is present only while ITS connect is running, so surfaces read
   * `slug in states` for one app and `Object.keys(states).length > 0` for "any".
   */
  states: Record<string, ConnectStep>;
  /**
   * Start (or reconnect) `toolkit`. Resolves with the poll outcome so callers
   * can react to a LANDED connection (the chat connect card nudges the agent on
   * `"active"`); `null` when the flow failed before/while polling (already
   * surfaced via `call()`) or when THAT slug already owns a flow (per-slug
   * single-flight — a different app still connects concurrently).
   */
  connect: (toolkit: string) => Promise<PollOutcome | null>;
  /** Reopen the SAME OAuth page for one toolkit (the user closed the tab). */
  reopen: (toolkit: string) => Promise<void>;
  /** Wake one toolkit's poll loop to check the connection right now. */
  checkNow: (toolkit: string) => Promise<void>;
  /** Stop one toolkit's loop with no toast; leaves the others running. */
  cancel: (toolkit: string) => void;
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
}

/**
 * Toolkit slug -> its live flow. Concurrent connects each own one entry, so a
 * cancel, wake, or redirect read addresses exactly one flow and never touches
 * its siblings. Deleting an entry (its flow's `finally`) frees only that slug.
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
  const entry: FlowEntry = { waker, cancelled: false, redirectUrl: null };
  reg.set(toolkit, entry);
  return entry;
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

/** Cancel EVERY flow (surface unmount): leaving the surface stops all polls. */
export function cancelAllFlows(reg: FlowRegistry): void {
  for (const entry of reg.values()) {
    entry.cancelled = true;
    entry.waker.wake();
  }
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
