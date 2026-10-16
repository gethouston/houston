import type {
  LinkedInCompletion,
  LinkedInConnection,
} from "@houston/engine-adapter";
import type { SlackCompletion } from "./settings-landing.ts";

/**
 * Redeem the ticket a LinkedIn connect's return landed with, once
 * (`takeSlackCompletion` owns the one-shot rule; a replayed link never
 * reaches the queue). Only this authenticated redemption binds the LinkedIn
 * account to the signed-in person: the share dialog's poll merely notices it.
 * DOM-free, so the order is testable.
 *
 *  - `connected`: the connection lands in the cache the dialog reads.
 *  - `unredeemable`: a mangled link, or a ticket the gateway refused
 *    (unknown, expired, spent, someone else's); connect again.
 */
export type LinkedInCompletionResult = "connected" | "unredeemable";

export interface LinkedInCompletionPorts {
  /** Who is signed in now (the session's user id), or null. */
  identity: () => string | null;
  complete: (ticket: string) => Promise<LinkedInCompletion>;
  landed: (connection: LinkedInConnection) => void;
  tell: (result: LinkedInCompletionResult) => void;
}

/**
 * A failed redemption already reported through the facade: nothing to tell.
 * An answer that comes back to someone else (signed out, or another account
 * signed in, while it was out) is dropped: it would put one person's LinkedIn
 * in the cache the next person's share dialog reads.
 */
export async function redeemLinkedIn(
  pending: SlackCompletion,
  ports: LinkedInCompletionPorts,
): Promise<void> {
  if (pending.kind === "invalid") return ports.tell("unredeemable");
  const startedAs = ports.identity();
  let result: LinkedInCompletion;
  try {
    result = await ports.complete(pending.ticket);
  } catch {
    return;
  }
  if (startedAs === null || ports.identity() !== startedAs) return;
  if (result.kind === "invalid") return ports.tell("unredeemable");
  ports.landed(result.connection);
  ports.tell("connected");
}

/**
 * What a queued return waits on: this deployment's capabilities, which say
 * whether it serves LinkedIn at all. Read before the ticket is taken, so a
 * failed read holds it (reported) for the read's next try instead of
 * dropping it. A deployment with no LinkedIn (a desktop on its local host, a
 * self-host) never minted the ticket and cannot redeem it: `drop`.
 */
export type LinkedInCompletionStep = "wait" | "hold" | "redeem" | "drop";

export function linkedInCompletionStep(read: {
  linkedinShare: boolean | null;
  isLoading: boolean;
  isError: boolean;
}): LinkedInCompletionStep {
  if (read.linkedinShare !== null)
    return read.linkedinShare ? "redeem" : "drop";
  if (read.isLoading) return "wait";
  return read.isError ? "hold" : "drop";
}

/** The queued returns whose hold was already reported, by the queued entry. */
const reportedHolds = new WeakSet<SlackCompletion>();

/**
 * Reports a held return once per queued ticket: a remount of the page that
 * holds it says nothing again, and a newer ticket held in turn still reports.
 */
export function reportHoldOnce(
  queued: SlackCompletion,
  report: () => void,
): void {
  if (reportedHolds.has(queued)) return;
  reportedHolds.add(queued);
  report();
}
