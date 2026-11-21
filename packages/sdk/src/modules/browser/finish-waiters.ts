import type { BrowserLiveFinishResult } from "./types";

export function finishWaiters() {
  let outcome: "done" | "cancel" | null = null;
  const waiters: ((result: BrowserLiveFinishResult) => void)[] = [];
  return {
    pending: (): "done" | "cancel" | null => outcome,
    request(next: "done" | "cancel"): Promise<BrowserLiveFinishResult> {
      outcome = next;
      return new Promise((resolve) => waiters.push(resolve));
    },
    settle(result: BrowserLiveFinishResult): void {
      outcome = null;
      for (const resolve of waiters.splice(0)) resolve(result);
    },
  };
}
