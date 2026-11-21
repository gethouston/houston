import { EngineError } from "@houston/runtime-client";
import { parseComputeRefusalText } from "@houston/wire-types";
import type { Clock } from "../ports";
import { COMPUTE_RETRY_BUDGET_MS } from "./http";

const DEFAULT_PAUSE_MS = 2_000;
const MIN_PAUSE_MS = 500;

export async function retryComputeRefusals<T>(
  clock: Clock,
  call: () => Promise<T>,
): Promise<T> {
  let paused = 0;
  for (;;) {
    try {
      return await call();
    } catch (e) {
      const refusal =
        e instanceof EngineError && e.status === 503
          ? parseComputeRefusalText(e.body)
          : null;
      if (!refusal) throw e;
      const pause = Math.max(
        MIN_PAUSE_MS,
        refusal.retryAfterMs ?? DEFAULT_PAUSE_MS,
      );
      if (paused + pause > COMPUTE_RETRY_BUDGET_MS) throw e;
      paused += pause;
      await new Promise<void>((resolve) => clock.setTimeout(resolve, pause));
    }
  }
}
