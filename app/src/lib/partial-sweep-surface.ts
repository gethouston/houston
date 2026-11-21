import { isEngineWakingError } from "./engine-waking-error.ts";
import { isNetworkTransportError } from "./network-transport-error.ts";

export function representativeSweepFailure(
  failedReasons: readonly unknown[],
): unknown {
  return (
    failedReasons.find(
      (reason) =>
        !isEngineWakingError(reason) && !isNetworkTransportError(reason),
    ) ?? failedReasons[0]
  );
}

export type PartialSweepToast = "waking" | "connectivity" | "error";

export function partialSweepToastKind(
  representativeReason: unknown,
): PartialSweepToast {
  if (isEngineWakingError(representativeReason)) return "waking";
  if (isNetworkTransportError(representativeReason)) return "connectivity";
  return "error";
}
