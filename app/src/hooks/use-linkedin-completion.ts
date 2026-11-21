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
