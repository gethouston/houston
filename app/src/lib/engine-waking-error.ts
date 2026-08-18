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
// other bodies on the same statuses ("setup pod unreachable", "agent pod
// unusable", provider quota pages, self-host proxies) carry different reasons
// and must keep surfacing as real errors. The read transport
// (`packages/web/src/engine-adapter/cp/transient-retry.ts`) parses the same
// two answers on the wire and gives them the cold-start retry budget first;
// this classifier decides how the ones that outlive that budget surface.

const ENGINE_UNAVAILABLE_503 = "engine unavailable";
const ENGINE_PROXY_FAILED_502 = "engine proxy failed";

/**
 * A gateway "engine unavailable" 503 or "engine proxy failed" 502: the
 * agent's engine pod is warming up, restarting, or otherwise not accepting
 * connections, and the same request succeeds once it does. Matched
 * structurally (name + status + message prefix) so this stays dependency-free;
 * `HoustonEngineError` mints the message as `"<reason> (engine error <status>)"`
 * with the gateway's reason verbatim.
 */
export function isEngineWakingError(err: unknown): boolean {
  if (!(err instanceof Error) || err.name !== "HoustonEngineError") {
    return false;
  }
  const status = (err as { status?: unknown }).status;
  return (
    (status === 503 && err.message.startsWith(ENGINE_UNAVAILABLE_503)) ||
    (status === 502 && err.message.startsWith(ENGINE_PROXY_FAILED_502))
  );
}
