import type {
  RoutineDeliveryFailureCode,
  RoutineRun,
  RoutineRunFailureCode,
} from "@houston/protocol";
import {
  failureCodeForReader,
  type RoutineReaderAccount,
} from "./failure-view";

export function routineFailureCode(
  run: Pick<RoutineRun, "delivery_failure" | "failure">,
  readerFor?: (provider: string) => RoutineReaderAccount,
): RoutineDeliveryFailureCode | RoutineRunFailureCode | undefined {
  if (run.delivery_failure) return run.delivery_failure.code;
  if (!run.failure) return undefined;
  if (run.failure.code === "no_model") return run.failure.code;
  return failureCodeForReader(run.failure, readerFor?.(run.failure.provider));
}
