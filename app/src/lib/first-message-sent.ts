import type { AnalyticsListener } from "./analytics-bus.ts";

/**
 * Account preference driving `first_message_sent`. Absent for every account
 * that never walked the first-run onboarding, which is what keeps the beat
 * from firing again for accounts that were already sending messages.
 */
export const FIRST_MESSAGE_SENT_KEY = "first_message_sent";

/** Where the account stands on its first message. */
export type FirstMessageState = "unarmed" | "armed" | "sent";

/** Stored values. Absent (or anything unrecognised) reads as `unarmed`. */
export const FIRST_MESSAGE_ARMED_VALUE = "armed";
export const FIRST_MESSAGE_SENT_VALUE = "1";

export function parseFirstMessageState(raw: string | null): FirstMessageState {
  const value = raw?.trim();
  if (value === FIRST_MESSAGE_ARMED_VALUE) return "armed";
  if (value === FIRST_MESSAGE_SENT_VALUE) return "sent";
  return "unarmed";
}

/**
 * Whether starting the first-run onboarding may arm the beat: only a fresh
 * account. An account that already sent keeps its `sent`, so a second
 * onboarding (an emptied workspace, a new device) never reports it twice.
 */
export function shouldArmFirstMessage(state: FirstMessageState): boolean {
  return state === "unarmed";
}

/**
 * Arms the beat for an account starting the first-run onboarding. Idempotent:
 * a resumed or repeated onboarding finds the account already armed or sent
 * and writes nothing.
 */
export async function armFirstMessage(deps: {
  readState: () => Promise<FirstMessageState>;
  writeArmed: () => Promise<void>;
}): Promise<void> {
  if (shouldArmFirstMessage(await deps.readState())) await deps.writeArmed();
}

export interface FirstMessageTrackerDeps {
  /** The account's stored state. */
  readState: () => Promise<FirstMessageState>;
  /** Persist that the first message was sent. */
  writeSent: () => Promise<void>;
  /** Report the `first_message_sent` beat. */
  track: () => void;
  /** Report a failed flag read or write. */
  onError: (command: string, err: unknown) => void;
}

/** A tracker bound to one signed-in account. */
export interface FirstMessageTracker {
  listener: AnalyticsListener;
  /** Ends the account's tracking: a read still in flight settles into
   *  nothing, and later sends are ignored. */
  dispose: () => void;
}

/**
 * An analytics-bus listener that turns an ARMED account's first
 * `chat_message_sent` into one `first_message_sent`. Every composer send, new
 * task and follow-up alike, already reports `chat_message_sent`, so listening
 * to it covers every send path with no hook in any of them.
 *
 * Only `armed` reports: the first-run onboarding arms the account when it
 * starts, so an existing account (`unarmed`) and one that already reported
 * (`sent`) stay silent. The latch closes synchronously on the first send, so
 * two sends in the same tick can never both fire. A failed READ reopens it:
 * the beat must not be reported on a guess, and the next send asks again. A
 * failed WRITE keeps it closed for this session; the beat already went out.
 *
 * The tracker belongs to the account signed in when it was created. After
 * `dispose` (the account changed), a read still in flight neither reports nor
 * writes: the preference and the analytics identity would both be the next
 * account's.
 */
export function createFirstMessageTracker(
  deps: FirstMessageTrackerDeps,
): FirstMessageTracker {
  let latched = false;
  let disposed = false;
  const listener: AnalyticsListener = (name) => {
    if (name !== "chat_message_sent" || latched || disposed) return;
    latched = true;
    deps.readState().then(
      (state) => {
        if (disposed || state !== "armed") return;
        deps.track();
        deps.writeSent().catch((err: unknown) => {
          deps.onError("first_message_sent_write", err);
        });
      },
      (err: unknown) => {
        latched = false;
        if (!disposed) deps.onError("first_message_sent_read", err);
      },
    );
  };
  return {
    listener,
    dispose: () => {
      disposed = true;
    },
  };
}
