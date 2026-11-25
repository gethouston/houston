import { useEffect, useRef } from "react";
import { armFirstMessageTracking } from "../../hooks/use-first-message-tracker";
import { useOnboardingCompleted } from "../../hooks/use-onboarding-completed";
import { useOnboardingPending } from "../../hooks/use-onboarding-pending";
import { analytics } from "../../lib/analytics";
import { logAndReportError } from "../../lib/error-report";
import type { OnboardingStep } from "../../lib/onboarding-route";
import { onboardingBeats } from "./connect-ai-card-state";
import { startFirstRun } from "./first-run-start";

/** Every first-run run reports this `source` on `onboarding_started`. */
const FIRST_RUN_SOURCE = "first_run";

/**
 * The first-run onboarding's lifecycle and funnel, for the component that
 * stays mounted across its three steps (`ManagerOnboardingHost`, around the
 * shell, whatever screen the person is on):
 *
 * - START ({@link startFirstRun}): a run that is not already pending records
 *   the `"started"` stage of `onboarding_pending` and reports
 *   `onboarding_started`; every mount arms `first_message_sent` for the
 *   account. The stage is the resume contract: hiring the first AI Employee
 *   flips the zero-agent first-run signal, so without it the user would be
 *   dropped out of onboarding before finishing their team.
 * - TEAM LATCH: the team step on screen records the `"team"` stage, so the
 *   run stays on it even if the AI provider drops while it hires.
 * - FUNNEL: each step shown reports its step view once, and leaving the
 *   connect step reports `ai_provider_connected` ({@link onboardingBeats}).
 * - FINISH (the returned callback, the conversation's last answer): reports
 *   `onboarding_completed`, clears the pending stage and stamps
 *   `onboarding_completed`. Both flags flip their query caches synchronously,
 *   so the same render routes into the app.
 *
 * `shown` is the step on display, or null while one is still loading, so a
 * step is never reported before the user can see it.
 */
export function useFirstRunOnboarding(args: {
  shown: OnboardingStep | null;
  providerId: string | null;
}): () => void {
  const { shown, providerId } = args;
  const { stage, markPending, clearPending } = useOnboardingPending();
  const { markCompleted } = useOnboardingCompleted();

  // A ref, not an empty-deps effect alone: StrictMode replays mount effects,
  // and a run must report exactly one start.
  const started = useRef(false);
  /* oxlint-disable react-hooks/exhaustive-deps -- whether this run is a resume is decided once, at mount. */
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startFirstRun({
      isPending: stage !== "none",
      reportStart: () =>
        analytics.track("onboarding_started", { source: FIRST_RUN_SOURCE }),
      markPending: () => markPending("started"),
      arm: armFirstMessageTracking,
      onError: logAndReportError,
    });
  }, []);
  /* oxlint-enable react-hooks/exhaustive-deps */

  // Set by the finish, which clears the stage in the same render that routes
  // into the app: the latch must never record it again on the way out.
  const finished = useRef(false);
  useEffect(() => {
    if (shown !== "team" || stage === "team" || finished.current) return;
    markPending("team").catch((err: unknown) => {
      logAndReportError("onboarding_pending_mark", err);
    });
  }, [shown, stage, markPending]);

  const previous = useRef<OnboardingStep | null>(null);
  const viewed = useRef(new Set<OnboardingStep>());
  /* oxlint-disable react-hooks/exhaustive-deps -- beats fire on screen changes only; the provider id is read at that transition. */
  useEffect(() => {
    if (shown === null || shown === previous.current) return;
    for (const beat of onboardingBeats({
      previous: previous.current,
      current: shown,
      viewed: viewed.current,
      providerId,
    })) {
      if (beat.event === "onboarding_step_viewed") {
        viewed.current.add(beat.step);
        analytics.track(beat.event, { step: beat.step });
      } else {
        analytics.track(beat.event, { provider: beat.provider });
      }
    }
    previous.current = shown;
  }, [shown]);
  /* oxlint-enable react-hooks/exhaustive-deps */

  return () => {
    finished.current = true;
    analytics.track("onboarding_completed");
    clearPending().catch((err: unknown) => {
      logAndReportError("onboarding_pending_clear", err);
    });
    markCompleted().catch((err: unknown) => {
      logAndReportError("onboarding_completed_mark", err);
    });
  };
}
