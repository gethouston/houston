import { useEffect } from "react";
import { analytics, subscribeAnalytics } from "../lib/analytics";
import { logAndReportError } from "../lib/error-report";
import {
  armFirstMessage,
  createFirstMessageTracker,
  FIRST_MESSAGE_ARMED_VALUE,
  FIRST_MESSAGE_SENT_KEY,
  FIRST_MESSAGE_SENT_VALUE,
  type FirstMessageState,
  parseFirstMessageState,
} from "../lib/first-message-sent";
import { tauriPreferences } from "../lib/tauri";
import { useSession } from "./use-session";

const readFirstMessageState = async (): Promise<FirstMessageState> =>
  parseFirstMessageState(await tauriPreferences.get(FIRST_MESSAGE_SENT_KEY));

/** Arms `first_message_sent` for the signed-in account. Called on every
 *  mount of the first-run onboarding (`first-run-start.ts`). */
export function armFirstMessageTracking(): Promise<void> {
  return armFirstMessage({
    readState: readFirstMessageState,
    writeArmed: () =>
      tauriPreferences.set(FIRST_MESSAGE_SENT_KEY, FIRST_MESSAGE_ARMED_VALUE),
  });
}

/**
 * Reports `first_message_sent` once per account that started the first-run
 * onboarding, on the first message the user sends to any AI Employee (see
 * {@link createFirstMessageTracker}). A new tracker per signed-in account, so
 * an account switch starts from that account's own stored state and drops
 * the previous account's reads still in flight.
 */
export function useFirstMessageTracker(): void {
  const { data: session } = useSession();
  const uid = session?.uid ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: uid re-keys the tracker per account; the state itself is read at send time.
  useEffect(() => {
    const tracker = createFirstMessageTracker({
      readState: readFirstMessageState,
      writeSent: () =>
        tauriPreferences.set(FIRST_MESSAGE_SENT_KEY, FIRST_MESSAGE_SENT_VALUE),
      track: () => analytics.track("first_message_sent"),
      onError: logAndReportError,
    });
    const unsubscribe = subscribeAnalytics(tracker.listener);
    return () => {
      unsubscribe();
      tracker.dispose();
    };
  }, [uid]);
}
