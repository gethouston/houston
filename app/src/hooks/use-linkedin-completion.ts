import type { LinkedInConnection } from "@houston/engine-adapter";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { reportError } from "../lib/error-report";
import { showExpectedStateToast } from "../lib/error-toast";
import i18n from "../lib/i18n";
import type { Session } from "../lib/identity/session";
import {
  linkedInCompletionStep,
  redeemLinkedIn,
  reportHoldOnce,
} from "../lib/linkedin-completion";
import { tauriLinkedIn } from "../lib/linkedin-facade";
import { queryKeys } from "../lib/query-keys";
import { takeSlackCompletion } from "../lib/slack-completion";
import { useUIStore } from "../stores/ui";
import { useCapabilities } from "./use-capabilities";

/**
 * Redeem a LinkedIn connect's return wherever the app is when it lands: the
 * tab the web click claimed (which then says it can be closed), the desktop
 * app the loopback or deep link focused. The connection goes into the cache the share dialog reads, so its
 * button turns to Post at once; an answer that comes back after sign-out, or
 * to another account, is dropped (`redeemLinkedIn`).
 */
export function useLinkedInCompletion() {
  const qc = useQueryClient();
  const queued = useUIStore((s) => s.pendingLinkedInCompletion);
  const clear = useUIStore((s) => s.setPendingLinkedInCompletion);
  const { capabilities, isLoading, isError } = useCapabilities();
  const step = linkedInCompletionStep({
    linkedinShare: capabilities ? capabilities.linkedinShare === true : null,
    isLoading,
    isError,
  });
  useEffect(() => {
    if (!queued || step === "wait") return;
    if (step === "hold") {
      // The ticket stays queued for the capabilities read's next try.
      return reportHoldOnce(queued, () =>
        reportError(
          "linkedin_completion",
          "LinkedIn return held: capabilities did not load",
        ),
      );
    }
    const pending = takeSlackCompletion(
      () => useUIStore.getState().pendingLinkedInCompletion,
      () => clear(null),
    );
    // Dropped unasked where LinkedIn is not served, as a Slack return there
    // lands on the Settings index with no Channels to take it.
    if (!pending || step === "drop") return;
    void redeemLinkedIn(pending, {
      identity: () =>
        qc.getQueryData<Session | null>(queryKeys.session())?.uid ?? null,
      complete: tauriLinkedIn.complete,
      landed: (connection) =>
        qc.setQueryData<LinkedInConnection>(
          queryKeys.linkedInConnection(),
          connection,
        ),
      tell: (result) =>
        result === "connected"
          ? showExpectedStateToast(
              i18n.t("teams:orgChart.share.completion.connectedTitle"),
              i18n.t("teams:orgChart.share.completion.connectedBody"),
            )
          : showExpectedStateToast(
              i18n.t("teams:orgChart.share.completion.unredeemableTitle"),
              i18n.t("teams:orgChart.share.completion.unredeemableBody"),
            ),
    });
  }, [queued, step, clear, qc]);
}
