// The two "quiet" failure classes of the error-surfacing layer, and the
// context a low-noise Sentry event for one of them carries. Dependency-free
// (only the two classifiers) so it is node-testable directly
// (app/tests/quiet-error-class.test.ts).
//
// A quiet class is an expected environment state — the agent's pod waking
// (`isEngineWakingError`) or the device offline (`isNetworkTransportError`) —
// that the user sees as ONE informational toast, never the bug pair. Until
// PRODUCT-1640 the same classes were declined by every Sentry path outright,
// so a raw gateway body (a DNS dial error against a cold pod, say) existed
// only in the user's local frontend log: hidden from the user had become
// hidden from us. They now capture as a warning with a FIXED fingerprint per
// class (`quiet-error-report.ts`), so each class is one Sentry issue with a
// count and searchable bodies, and a deploy roll can never file new issues.

// Dependency-free subpath: the app's node:test entry points cannot load the
// SDK root (it pulls @houston/domain, whose extensionless imports node rejects).
import { isBridgeUnsupported } from "@houston/sdk/local-model-bridge/unsupported";
import { isEngineWakingError } from "./engine-waking-error.ts";
import { isNetworkTransportError } from "./network-transport-error.ts";
import { isNoAgentForProviderWriteError } from "./no-agent-provider-write-error.ts";
import { isNoBrowserFailure } from "./url-open-failure.ts";

/** Doubles as the Sentry fingerprint, so the value is the issue's identity.
 *  `release_host_unavailable` is the updater's release host answering a
 *  transient status for its whole retry budget (PRODUCT-1811); it is only
 *  ever named by the download report path, never by `classifyQuietError`. */
export type QuietErrorClass =
  | "engine_waking"
  | "offline"
  | "bridge_unsupported"
  | "bridge_no_agent"
  | "bridge_state"
  | "release_host_unavailable"
  | "no_url_handler";

/** The SDK's own bridge retry state (`BridgeStateError`), seen by name and
 *  shape so this module stays free of the SDK root. */
function isBridgeStateError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.name === "BridgeStateError" &&
    typeof (err as { status?: unknown }).status === "string"
  );
}

/**
 * `bridge_unsupported` is the deployment honestly declining local models: the
 * gateway advertises no `localModelBridge` capability (relay not activated on
 * that environment, or an older self-host). Every desktop boot asks, so it is
 * one fingerprinted warning, never a per-user bug. It is checked before the
 * waking class because it also rides a 503.
 *
 * `no_url_handler` is the shell's `open_url` answering that nothing on the
 * machine opens a URL (no default browser, Windows `ShellExecuteW` code 31).
 * `openExternalUrl` already turns that into the remedy toast for the
 * fire-and-forget sites; this class catches the paths that keep the
 * rejection and report it, the codex loopback relay above all
 * (HOUSTON-APP-5EV, PRODUCT-1814): one fingerprinted warning, never a bug.
 *
 * `bridge_no_agent` is the bridge bootstrap asking for a runtime in a space
 * whose validated agent list is empty (`NoAgentForProviderWriteError`): the
 * bootstrap retry curve resolves it once an agent exists, and the connect
 * dialog already shows "create an agent first". It filed one error per user
 * per boot (HOUSTON-APP-5E0, PRODUCT-1833).
 *
 * `bridge_state` is the SDK's own bridge retry state (`model_unavailable`:
 * the user's local server does not serve the model; `reconnecting`: the
 * native session dropped). The bridge status surface shows it inline and the
 * SDK retries on its own curve; each retry filed a red error
 * (HOUSTON-APP-5E1, PRODUCT-1833). The state is the event's body.
 */
export function classifyQuietError(err: unknown): QuietErrorClass | null {
  if (isNoBrowserFailure(err)) return "no_url_handler";
  if (isBridgeUnsupported(err)) return "bridge_unsupported";
  if (isNoAgentForProviderWriteError(err)) return "bridge_no_agent";
  if (isBridgeStateError(err)) return "bridge_state";
  if (isEngineWakingError(err)) return "engine_waking";
  if (isNetworkTransportError(err)) return "offline";
  return null;
}

export interface QuietErrorDetails {
  /** HTTP status of the gateway answer; null for a transport drop. */
  status: number | null;
  /** The raw response body, whatever shape the client stack kept it in. */
  body: string | null;
}

/**
 * The status and RAW body off any of the three gateway error shapes
 * (`HoustonEngineError` keeps the parsed JSON on `body`, `AgentsHttpError`
 * carries the raw text as its message, the runtime client's `EngineError`
 * keeps the raw text on `body`) — the searchable payload the Sentry event
 * exists to carry. A transport `TypeError` has no status and its message IS
 * the diagnostic; a status-0 wrapper around one (the store client's
 * `StoreApiError`) reads the same way, since `0` is "no response", not an
 * HTTP status, and its `body` is the thrown error itself.
 */
export function quietErrorDetails(err: unknown): QuietErrorDetails {
  if (!(err instanceof Error)) return { status: null, body: null };
  const status = (err as { status?: unknown }).status;
  const body = (err as { body?: unknown }).body;
  const rawBody =
    typeof body === "string"
      ? body
      : body instanceof Error
        ? body.message
        : body !== null && body !== undefined
          ? JSON.stringify(body)
          : err.message;
  return {
    status: typeof status === "number" && status > 0 ? status : null,
    body: rawBody,
  };
}

/**
 * The agent a failed call was scoped to, when anything on the way knows it:
 * the `agentId` the gateway fetch stamps on a per-agent `HoustonEngineError`
 * first — it is the SAME id the fetch reports successes under, so an episode
 * keyed on it is the one a later success closes — else the engine-call
 * `context` (some `call()` sites pass `agentPath` / `agentId`). Null for
 * calls no layer could scope (the SDK agent-write path, the runtime client):
 * those still capture, they just cannot feed the per-agent stuck-wake tracker.
 */
export function agentKeyOf(
  err: unknown,
  context?: Record<string, unknown>,
): string | null {
  const stamped = (err as { agentId?: unknown } | null)?.agentId;
  if (typeof stamped === "string" && stamped) return stamped;
  for (const key of ["agentId", "agentPath"]) {
    const value = context?.[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}
