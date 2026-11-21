import { useEffect } from "react";
import { analytics } from "../../lib/analytics";
import { logAndReportError } from "../../lib/error-report";
import { sendManagerHandoff } from "../../lib/manager-onboarding/send-handoff";
import { useManagerHandoffStore } from "../../stores/manager-handoff";

export function useManagerHandoff(
  sessionKey: string,
  sendAuthored: (
    sessionKey: string,
    text: string,
    context: string,
    grants: ["createAgent"],
  ) => Promise<void>,
  busy: boolean,
): void {
  useEffect(() => {
    void sendManagerHandoff(
      () => useManagerHandoffStore.getState().take(),
      (handoff) => useManagerHandoffStore.getState().handOff(handoff),
      sessionKey,
      (key, handoff) =>
        sendAuthored(key, handoff.text, handoff.context, handoff.grants),
      () => analytics.track("onboarding_goal_handoff"),
      busy,
    ).catch((error: unknown) =>
      logAndReportError("onboarding_goal_handoff_send", error),
    );
  }, [sessionKey, sendAuthored, busy]);
}
