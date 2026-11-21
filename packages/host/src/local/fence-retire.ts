import type { LeaseHolderState } from "@houston/runtime-client/object-sync";

export const FENCE_RETIRE_DRAIN_MS = 3_000;
export const FENCE_RETIRE_DEADLINE_MS = 20_000;

export interface FenceRetireDeps {
  agent: string;
  stop: (opts: { drainMs: number }) => Promise<void>;
  standDown: (drainMs: number) => Promise<void>;
  exit: (code: number) => void;
  flushReports: () => Promise<unknown>;
  deadlineMs?: number;
}

export function respondToFenceLoss(
  deps: FenceRetireDeps,
): (holder: LeaseHolderState) => void {
  let stoodDown = false;
  let retiring = false;
  return (holder) => {
    if (holder === "live") {
      if (stoodDown || retiring) return;
      stoodDown = true;
      console.error(
        `[local-host] fence stand-down agent=${deps.agent} reason=live_holder: another running engine owns this agent's store; this pod stops firing routines and running turns, and refuses writes until it is replaced`,
      );
      void deps.standDown(FENCE_RETIRE_DRAIN_MS).catch((err: unknown) => {
        console.error("[local-host] stand-down failed:", err);
      });
      return;
    }
    if (retiring) return;
    retiring = true;
    console.error(
      `[local-host] fence retire agent=${deps.agent} reason=stale_holder drain_ms=${FENCE_RETIRE_DRAIN_MS}: another boot owns this agent's store and this pod can no longer persist writes; retiring it so the agent has one writer`,
    );
    const deadline = new Promise<void>((resolve) => {
      setTimeout(resolve, deps.deadlineMs ?? FENCE_RETIRE_DEADLINE_MS);
    });
    const stopped = deps
      .stop({ drainMs: FENCE_RETIRE_DRAIN_MS })
      .catch((err: unknown) => {
        console.error("[local-host] retire stop failed; exiting anyway:", err);
      });
    void Promise.race([stopped, deadline])
      .then(() => deps.flushReports())
      .finally(() => deps.exit(1));
  };
}
