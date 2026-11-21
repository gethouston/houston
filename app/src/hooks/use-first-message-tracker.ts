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

export function armFirstMessageTracking(): Promise<void> {
  return armFirstMessage({
    readState: readFirstMessageState,
    writeArmed: () =>
      tauriPreferences.set(FIRST_MESSAGE_SENT_KEY, FIRST_MESSAGE_ARMED_VALUE),
  });
}

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
