import type {
  RoutineDeliveryFailureCode,
  RoutineRun,
  RoutineRunFailureCode,
} from "@houston/protocol";
import {
  failureCodeForReader,
  type RoutineReaderAccount,
} from "./failure-view";

/**
 * The failure code a surface presents for a run. Delivery failures (expiry,
 * a creator who lost access) stay separate from failures that can auto-pause
 * a routine. `readerFor` is what
 * the reader's own account says about a provider: a "not connected" failure on
 * an account the gateway signed out reads as a reconnect (`./failure-view`).
 */
export function routineFailureCode(
  run: Pick<RoutineRun, "delivery_failure" | "failure">,
  readerFor?: (provider: string) => RoutineReaderAccount,
): RoutineDeliveryFailureCode | RoutineRunFailureCode | undefined {
  if (run.delivery_failure) return run.delivery_failure.code;
  if (!run.failure) return undefined;
  if (run.failure.code === "no_model") return run.failure.code;
  return failureCodeForReader(run.failure, readerFor?.(run.failure.provider));
}
