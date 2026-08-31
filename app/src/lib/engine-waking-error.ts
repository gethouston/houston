// The "is this failure just the agent's pod not reachable yet?" classifier for
// the error-surfacing layer (HOU-1114, PRODUCT-1403). Dependency-free so it is
// node-testable directly (app/tests/engine-waking-error.test.ts) and
// importable from anywhere.
//
// On the hosted profile the gateway has two ways of saying "the agent's engine
// pod is not there right now", both of which self-heal on retry once the pod
// listens again — nothing in Houston broke, so the bug-report pipeline (Sentry
// capture + the error surface) is the wrong place for either:
//
//  - `503 {"error": "engine unavailable"}` — the pod is not reachable yet: a
//    freshly installed store agent still provisioning, or an asleep pod mid
//    cold-start (HOU-1114: a user who just installed an agent read the red
//    toast as the install failing).
//  - `502 {"error": "engine proxy failed", "detail": <dial error>}` — the
//    gateway's per-agent proxy exhausted its dial ladder against a pod it
//    believes is running: the pod is restarting under an engine roll (every
//    deploy re-rolls every agent pod) or was just replaced. Every deploy day
//    produced a burst of these on the passive per-agent reads (`list_skills`,
//    `read_agent_file`, ...), each captured as a bug for a pod that was up
//    again seconds later (PRODUCT-1403 / HOUSTON-APP-4WQ).
//
// Keyed on the exact (status, gateway reason) pairs, NOT on bare 502/503:
// other bodies on the same statuses ("setup pod unreachable", provider quota
// pages, self-host proxies) carry different reasons and must keep surfacing as
// real errors. The read transport
// (`packages/web/src/engine-adapter/cp/transient-retry.ts`) parses the same
// two answers on the wire and gives them the cold-start retry budget first;
// this classifier decides how the ones that outlive that budget surface.
//
// Two client stacks reach the gateway, minting different error shapes (same
// split as `agent-name-conflict.ts`):
//
//  - `HoustonEngineError` (legacy adapter): message is
//    `"<reason> (engine error <status>)"`, reason verbatim — prefix-matched.
//  - `AgentsHttpError` (the SDK agent-write path: rename/create/delete):
//    message is the gateway's RAW JSON body, so the reason is parsed out of
//    it. Renaming an asleep agent answered the same wake 503 but escaped this
//    classifier into the red toast + Sentry pipeline because only the legacy
//    shape was matched (HOUSTON-APP-536).
//
// The SDK write branch additionally treats `502 {"error":"agent pod
// unusable"}` as a wake: on the gateway's agent-write routes that reason is
// minted exactly when the engine PATCH/seed round-trip to the pod fails at the
// transport level (`cloud/internal/edge/agents/routes.go` renameAgent) — the
// observed shape is a rename retried seconds into a cold start, where the pod
// accepts connections but hasn't answered before the gateway's deadline. The
// gateway logs every such failure server-side ("agent pod unusable during
// rename"), so classifying it quiet here loses no observability. On the legacy
// shape "agent pod unusable" keeps surfacing as a real error: there it arrives
// from the dispatch path, where a wedged pod is a bug we want reported.

const ENGINE_UNAVAILABLE_503 = "engine unavailable";
const ENGINE_PROXY_FAILED_502 = "engine proxy failed";
const AGENT_POD_UNUSABLE_502 = "agent pod unusable";

/** The gateway `error` reason out of an `AgentsHttpError` message, which
 *  carries the response body verbatim; null when the body isn't gateway JSON
 *  (an HTML error page, the synthetic `agents request failed: <status>`). */
function gatewayReason(message: string): string | null {
  if (!message.startsWith("{")) return null;
  try {
    const reason = (JSON.parse(message) as { error?: unknown } | null)?.error;
    return typeof reason === "string" ? reason : null;
  } catch {
    return null;
  }
}

/**
 * A gateway "the agent's pod is not there right now" answer: the pod is
 * warming up, restarting, or otherwise not accepting connections, and the same
 * request succeeds once it does. Matched structurally (name + status + reason)
 * so this stays dependency-free.
 */
export function isEngineWakingError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as { status?: unknown }).status;
  if (err.name === "HoustonEngineError") {
    return (
      (status === 503 && err.message.startsWith(ENGINE_UNAVAILABLE_503)) ||
      (status === 502 && err.message.startsWith(ENGINE_PROXY_FAILED_502))
    );
  }
  if (err.name === "AgentsHttpError") {
    const reason = gatewayReason(err.message);
    return (
      (status === 503 && reason === ENGINE_UNAVAILABLE_503) ||
      (status === 502 &&
        (reason === ENGINE_PROXY_FAILED_502 ||
          reason === AGENT_POD_UNUSABLE_502))
    );
  }
  return false;
}
