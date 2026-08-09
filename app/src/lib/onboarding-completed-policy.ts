/**
 * Pure resolution policy for the durable `onboarding_completed` flag
 * (PRODUCT-1282), extracted so the merge of its two stores is unit-testable
 * without React Query or a live host (same convention as `onboarding-flow.ts`).
 *
 * Two stores, upgrade-only semantics (there is no un-complete):
 *  - the ACCOUNT preference behind `/v1/preferences/onboarding_completed` —
 *    the durable copy: survives sign-out (which purges every account-scoped
 *    localStorage key) and follows the account across devices;
 *  - the per-uid localStorage MIRROR — the device fallback that keeps a
 *    completed user completed while the host is unreachable.
 */

/** Outcome of reading the account preference. */
export type AccountFlagRead =
  /** The account pref is set: the user finished onboarding somewhere. */
  | "completed"
  /** The read succeeded and the pref is absent/blank. */
  | "unset"
  /** The read failed (host waking / offline) — the value is unknown. */
  | "unreachable";

export interface OnboardingCompletedResolution {
  /** What the boot gate should treat as the flag's value. */
  completed: boolean;
  /** Re-stamp the device mirror (the account pref is authoritative-true). */
  refreshMirror: boolean;
  /** Write the account pref back up: the mirror says completed but the
   *  account copy is missing (a pre-fix device-local completion, or a lost
   *  write). Healing it is what makes the flag survive the NEXT sign-out. */
  healAccount: boolean;
}

/** Merge the account pref and the device mirror. Upgrade-only: either store
 *  saying completed wins; an unreachable account read never downgrades a
 *  mirrored completion, and an unset one gets healed from it. */
export function resolveOnboardingCompleted(
  account: AccountFlagRead,
  mirrorSet: boolean,
): OnboardingCompletedResolution {
  if (account === "completed") {
    return { completed: true, refreshMirror: true, healAccount: false };
  }
  return {
    completed: mirrorSet,
    refreshMirror: false,
    // Only heal on a SUCCESSFUL empty read: against an unreachable host the
    // write would fail too, and a transient outage must not spam retries.
    healAccount: mirrorSet && account === "unset",
  };
}
