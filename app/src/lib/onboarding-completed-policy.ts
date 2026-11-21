export type AccountFlagRead = "completed" | "unset" | "unreachable";

export interface OnboardingCompletedResolution {
  completed: boolean;
  refreshMirror: boolean;
  healAccount: boolean;
}

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
    healAccount: mirrorSet && account === "unset",
  };
}
