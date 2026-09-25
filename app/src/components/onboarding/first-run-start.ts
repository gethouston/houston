export interface FirstRunStartDeps {
  /** Whether the account already has a first-run onboarding mid-flight
   *  (any `onboarding_pending` stage but `"none"`). */
  isPending: boolean;
  /** Report `onboarding_started`. */
  reportStart: () => void;
  /** Record the run's `"started"` stage in `onboarding_pending`. */
  markPending: () => Promise<void>;
  /** Arm `first_message_sent` for the account. Idempotent. */
  arm: () => Promise<void>;
  /** Report a failed write. */
  onError: (command: string, err: unknown) => void;
}

/**
 * What mounting the first-run onboarding does. A fresh run reports its start
 * once and marks the run pending. Arming runs on EVERY mount, resumes
 * included: it is idempotent, and a run whose first arming failed would
 * otherwise never report its first message. Only a genuine first run mounts
 * the onboarding: an account with AI Employees and no first run in flight
 * (the in-app tutorial's stale flag included) routes to the app and never
 * arms (`onboardingRoute`, `parseOnboardingPending`).
 */
export function startFirstRun(deps: FirstRunStartDeps): void {
  if (!deps.isPending) {
    deps.reportStart();
    deps.markPending().catch((err: unknown) => {
      deps.onError("onboarding_pending_mark", err);
    });
  }
  deps.arm().catch((err: unknown) => {
    deps.onError("first_message_sent_arm", err);
  });
}
