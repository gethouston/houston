import type { IntegrationConnection } from "@houston-ai/engine-client";
import type { FlowEntry } from "./connect-flow-registry.ts";
import {
  POLL_INTERVAL_MS,
  type PollOutcome,
  pollConnectionUntilActive,
} from "./model.ts";

/**
 * The connect hand-off's phase machine, pure and dependency-injected so every
 * transition (which phase is published when, what settles the row, when the
 * connections query is refreshed) is unit-testable without React, timers, or a
 * host. The React hook (`use-connect-flow.ts`) only supplies the real engine
 * calls, the shared store's setters, and the toast.
 */

/** One toolkit's LIVE hand-off phase: minting the link vs. polling the OAuth. */
export type ConnectStep = "starting" | "waiting";

/**
 * What a settled flow leaves on the row it started from, so the feedback lands
 * where the user clicked:
 *  - `connected` — the OAuth landed (the row confirms, then the catalog moves
 *    the app into Installed);
 *  - `failed`    — the provider rejected or revoked the OAuth;
 *  - `stopped`   — the poll budget ran out because the user walked away; the
 *    app's own catalog row, now marked "Finishing up", picks it back up.
 * A cancel leaves nothing: the user already knows.
 */
export type ConnectNotice = "connected" | "failed" | "stopped";

/**
 * How long the success confirmation stays on the row BEFORE the connections
 * query is refreshed. Without it the app teleports out of Available and into
 * Installed in the same frame the spinner stops; with it the row the user
 * clicked says "connected" first. A dwell, not an animation, so it is not bound
 * by the motion budget.
 */
export const CONNECT_SUCCESS_DWELL_MS = 900;

export interface ConnectRunDeps {
  /** This flow's registry entry: cancel flag, waker, redirect URL. */
  entry: FlowEntry;
  /** Mint the hosted OAuth link for the toolkit. */
  mintLink: (
    toolkit: string,
  ) => Promise<{ redirectUrl: string; connectionId: string }>;
  /** Hand the user off to their browser. */
  openUrl: (url: string) => Promise<void>;
  /** One connection-status read. */
  readConnection: (connectionId: string) => Promise<IntegrationConnection>;
  /** Publish the live phase for this slug (`null` clears it). */
  setStep: (toolkit: string, step: ConnectStep | null) => void;
  /** Publish the settled notice for this slug (`null` clears it). */
  setNotice: (toolkit: string, notice: ConnectNotice | null) => void;
  /** Refresh the connections query once the flow settles. */
  invalidate: () => Promise<void>;
  /**
   * Pull the app window back over the browser the user just finished the
   * OAuth (or hosted API-key entry) in — the same snap-back a provider
   * sign-in does (PRODUCT-1298). Called only when the connection LANDS: a
   * failure leaves the user on the provider's error page, and a timeout means
   * they walked away long ago — yanking focus then would be focus-stealing.
   */
  focus: () => Promise<void>;
  /** Toast the outcome (success / neutral / error). Never called for a cancel. */
  announce: (toolkit: string, outcome: PollOutcome) => void;
  /** Free the slug so it can be connected again. */
  release: (toolkit: string) => void;
  /**
   * Report a failure that has NO copy of its own (settling broke). Injected so
   * this module stays free of the Sentry/i18n import graph; the hook passes
   * `logAndReportError`.
   */
  report: (command: string, err: unknown) => void;
  /** The poll's inter-attempt wait (the entry's waker in production). */
  wait: (ms: number) => Promise<void>;
  /** The success dwell. Injected so tests need no real clock. */
  sleep: (ms: number) => Promise<void>;
}

/**
 * Run ONE toolkit's connect: mint the hosted link, open the browser, poll until
 * the OAuth lands, then settle the row and refresh the connections.
 *
 * Phases are published as they happen — `starting` covers ONLY the link mint
 * (the browser has not opened yet, so no surface may claim it has), `waiting`
 * begins the moment the browser is open. Every outcome the engine call cannot
 * see is surfaced: a landed connection, a provider-side failure, and an
 * abandoned OAuth. A cancel is silent by design.
 *
 * Returns the poll outcome, or `null` when an engine call failed (it already
 * toasted through `call()`), so the click handler never leaks a rejection.
 */
export async function runConnectFlow(
  toolkit: string,
  deps: ConnectRunDeps,
): Promise<PollOutcome | null> {
  const { entry } = deps;
  deps.setNotice(toolkit, null);
  deps.setStep(toolkit, "starting");
  try {
    let outcome: PollOutcome;
    // The try covers the ENGINE half only — minting the link, the browser hop,
    // the poll. Widening it over `settle` is what once turned a rejected
    // invalidate/announce into a `null` return, reporting a LANDED connection
    // as "the connect failed".
    try {
      const { redirectUrl, connectionId } = await deps.mintLink(toolkit);
      entry.redirectUrl = redirectUrl;
      // A cancel that landed while the link was still minting must NOT go on to
      // pop the OAuth tab: bail with the same silent outcome the poll yields.
      if (entry.cancelled) {
        outcome = "cancelled";
      } else {
        await deps.openUrl(redirectUrl);
        deps.setStep(toolkit, "waiting");
        outcome = await pollConnectionUntilActive({
          poll: () => deps.readConnection(connectionId),
          sleep: deps.wait,
          isCancelled: () => entry.cancelled,
          intervalMs: POLL_INTERVAL_MS,
        });
      }
    } catch {
      // The failing engine call already surfaced its own toast via call(), but
      // the ROW must not simply go blank: leave the same `failed` outcome a
      // provider-side rejection leaves, so the inline state explains the death
      // where the user is looking. The re-throw is swallowed so the click
      // handler never leaks an unhandled rejection.
      deps.setNotice(toolkit, "failed");
      return null;
    }
    await settle(toolkit, outcome, deps);
    return outcome;
  } finally {
    deps.release(toolkit);
    deps.setStep(toolkit, null);
  }
}

/**
 * End the live phase, leave the outcome on the row, and refresh connections.
 * The success path holds the confirmation for {@link CONNECT_SUCCESS_DWELL_MS}
 * BEFORE the refresh, so the row reads "connected" where the user clicked
 * instead of vanishing into the Installed strip in the same frame.
 *
 * The notice is published BEFORE the step is cleared: the store reads "a flow
 * ended carrying no outcome" as a cancel and retires that slug's origin, so the
 * reverse order would strip a settled flow of the row it belongs to.
 *
 * Settling cannot fail the flow (the outcome is already known and true), yet a
 * broken refresh must not be silent either — it is reported, never swallowed,
 * and never allowed to reject out of a fire-and-forget click handler.
 */
async function settle(
  toolkit: string,
  outcome: PollOutcome,
  deps: ConnectRunDeps,
): Promise<void> {
  const settled = outcome !== "cancelled";
  if (settled) deps.setNotice(toolkit, noticeFor(outcome));
  deps.setStep(toolkit, null);
  if (outcome === "active") {
    // Fire-and-forget with its own report: focus is a nicety that must never
    // delay the dwell/refresh, and a broken focus must not read as a broken
    // settle — but it is never silent either.
    void deps
      .focus()
      .catch((err) => deps.report("integrations.connectFlow.focus", err));
  }
  try {
    if (settled) deps.announce(toolkit, outcome);
    if (outcome === "active") await deps.sleep(CONNECT_SUCCESS_DWELL_MS);
    await deps.invalidate();
  } catch (err) {
    deps.report("integrations.connectFlow.settle", err);
  }
}

/** The row-level notice each settled outcome leaves behind. */
export function noticeFor(
  outcome: Exclude<PollOutcome, "cancelled">,
): ConnectNotice {
  if (outcome === "active") return "connected";
  if (outcome === "timeout") return "stopped";
  return "failed";
}
