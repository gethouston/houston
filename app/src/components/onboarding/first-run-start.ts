export interface FirstRunStartDeps {
  isPending: boolean;
  reportStart: () => void;
  markPending: () => Promise<void>;
  arm: () => Promise<void>;
  onError: (command: string, err: unknown) => void;
}

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
