// Dependency-free subpath imports: the app's node:test runner drives this
// module directly (app/tests/local-bridge-report-plan.test.ts) and cannot load
// the SDK root.
import { isBridgeCancellation } from "@houston/sdk/local-model-bridge/errors";
import { bridgeQuietClass } from "@houston/sdk/local-model-bridge/quiet";
import { isBridgeUnsupported } from "@houston/sdk/local-model-bridge/unsupported";

/**
 * What the app's one bridge report funnel (`reportLocalBridgeError`) does with
 * a rejection:
 *
 * - `cancelled`: the operation was superseded, not failed. A space, agent or
 *   session switch invalidated the bridge lifetime while a wake was waiting on
 *   its status GET, or the wake reached a controller already disposed. Nothing
 *   broke and the next scope wakes on its own, so nothing is reported anywhere
 *   (no toast, no Sentry, no quiet class) and the cause goes to the debug log
 *   only (HOUSTON-APP-5HX).
 * - `unsupported`: the deployment offers no bridge, the quiet
 *   `bridge_unsupported` class.
 * - `quiet`: the SDK's other expected bridge states (`bridgeQuietClass`): one
 *   fingerprinted warning, nothing red. `cause` rides as `extra`, since a
 *   native string rejection leaves the quiet event no body to carry.
 * - `failed`: everything else stays loud. `cause` (error name + message) rides
 *   as `extra` beside the status and body, because the report error carries
 *   only the stack (PRODUCT-1833).
 */
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
