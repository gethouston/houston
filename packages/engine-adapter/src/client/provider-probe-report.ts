import { isAbortError } from "@houston/sdk/abort-signal";
import { gatewayReason, isEngineWakingError } from "../engine-waking-error";
import { reportAdapterError } from "../error-sink";
import { isNetworkTransportError } from "../network-transport-error";
import { isSignedOutEngineError } from "./errors";

// Signatures already reported this session. A failure that persists is
// re-probed every few seconds per window (the picker's self-heal timer plus
// its query retry), so reporting each attempt turns one broken route into
// about a thousand events an hour; the first event already says everything.
const reported = new Set<string>();

/**
 * Report a failed provider status probe, once per session per signature.
 * An unreachable engine (offline, pod waking, the probe timeout) and a
 * signed-out session are expected states, not bugs, and stay quiet.
 */
export function reportProbeFailure(error: unknown): void {
  if (
    isNetworkTransportError(error) ||
    isEngineWakingError(error) ||
    isAbortError(error) ||
    isSignedOutEngineError(error)
  ) {
    return;
  }
  const signature = signatureOf(error);
  if (reported.has(signature)) return;
  reported.add(signature);
  reportAdapterError("provider-status.probe", error);
}

/** The HTTP status plus the gateway's reason or code; for an error with no
 *  status (a thrown bug), its name and message. */
function signatureOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const { status, body } = error as { status?: unknown; body?: unknown };
  if (typeof status !== "number") return `${error.name}: ${error.message}`;
  return `${status} ${reasonOf(body ?? error.message) ?? ""}`;
}

function reasonOf(body: unknown): string | null {
  if (typeof body === "string") return gatewayReason(body);
  const detail = (body as { error?: unknown } | null)?.error;
  if (typeof detail === "string") return detail;
  const code = (detail as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}
