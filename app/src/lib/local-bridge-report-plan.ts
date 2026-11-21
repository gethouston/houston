import { isBridgeCancellation } from "@houston/sdk/local-model-bridge/errors";
import { bridgeQuietClass } from "@houston/sdk/local-model-bridge/quiet";
import { isBridgeUnsupported } from "@houston/sdk/local-model-bridge/unsupported";

export type LocalBridgeReportPlan =
  | { kind: "cancelled"; cause: string }
  | { kind: "unsupported" }
  | { kind: "quiet"; quiet: "bridge_no_agent" | "bridge_state"; cause: string }
  | { kind: "failed"; cause: string };

export function planLocalBridgeReport(error: unknown): LocalBridgeReportPlan {
  const cause =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (isBridgeCancellation(error)) return { kind: "cancelled", cause };
  if (isBridgeUnsupported(error)) return { kind: "unsupported" };
  const quiet = bridgeQuietClass(error);
  if (quiet === "bridge_no_agent" || quiet === "bridge_state")
    return { kind: "quiet", quiet, cause };
  return { kind: "failed", cause };
}
