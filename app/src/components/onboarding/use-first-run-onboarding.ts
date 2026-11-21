import { useEffect, useRef } from "react";
import { armFirstMessageTracking } from "../../hooks/use-first-message-tracker";
import { useOnboardingCompleted } from "../../hooks/use-onboarding-completed";
import { useOnboardingPending } from "../../hooks/use-onboarding-pending";
import { analytics } from "../../lib/analytics";
import { logAndReportError } from "../../lib/error-report";
import type { OnboardingStep } from "../../lib/onboarding-route";
import { onboardingBeats } from "./connect-ai-card-state";
import { startFirstRun } from "./first-run-start";

const FIRST_RUN_SOURCE = "first_run";

export function useFirstRunOnboarding(args: {
  shown: OnboardingStep | null;
  providerId: string | null;
}): () => void {
  const { shown, providerId } = args;
  const { stage, markPending, clearPending } = useOnboardingPending();
  const { markCompleted } = useOnboardingCompleted();

  const started = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: whether this run is a resume is decided once, at mount.
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

  const finished = useRef(false);
  useEffect(() => {
    if (shown !== "team" || stage === "team" || finished.current) return;
    markPending("team").catch((err: unknown) => {
      logAndReportError("onboarding_pending_mark", err);
    });
  }, [shown, stage, markPending]);

  const previous = useRef<OnboardingStep | null>(null);
  const viewed = useRef(new Set<OnboardingStep>());
  // biome-ignore lint/correctness/useExhaustiveDependencies: beats fire on screen changes only; the provider id is read at that transition.
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
