import { isAbortError } from "@houston/sdk/abort-signal";
import { gatewayReason, isEngineWakingError } from "../engine-waking-error";
import { reportAdapterError } from "../error-sink";
import { isNetworkTransportError } from "../network-transport-error";
import { isSignedOutEngineError } from "./errors";

const reported = new Set<string>();

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
