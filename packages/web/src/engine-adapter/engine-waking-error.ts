// The "is this failure just the agent's pod not reachable yet?" classifier for
// the error-surfacing layer (HOU-1114, PRODUCT-1403). Dependency-free so it is
// node-testable directly (app/tests/engine-waking-error.test.ts) and
// importable from anywhere.
//
// It lives in the engine adapter, not app/src/lib: the adapter is bundled by
// BOTH the desktop app (app/vite.config.ts aliases `@houston-ai/engine-client`
// at this directory) and the web shell, and only the web build can resolve
// `@houston/app/*`. An adapter import of app code broke every desktop release
// build while the web build passed. app/src/lib/engine-waking-error.ts
// re-exports this module for the app's own call sites.
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
// other bodies on the same statuses (provider quota pages, self-host proxies)
// carry different reasons and must keep surfacing as real errors. The read
// transport (`packages/web/src/engine-adapter/cp/transient-retry.ts`) parses
// the same two answers on the wire and gives them the cold-start retry budget
// first; this classifier decides how the ones that outlive that budget
// surface.
//
// A third "not there yet" answer comes from the HOST itself, not the gateway:
// `503 {"error":"the agent's runtime is still starting, try again shortly"}`
// (`packages/host/src/channel/probe-wake.ts`). The read-only probe routes
// (`/providers`, `/providers/usage`, `/auth/status`) race the agent runtime's
// boot against a short deadline and answer this plus `Retry-After: 2` rather
// than hold the socket for the whole cold boot. The boot keeps running; the
// retry meets a live runtime. Same waking state, a different reason string,
// and it escaped into the red toast + Sentry pipeline because only the two
// gateway reasons were matched (HOUSTON-APP-54Q).
//
// Four client stacks reach the host, minting different error shapes (same
// split as `agent-name-conflict.ts`, plus the runtime client):
//
//  - `HoustonEngineError` (legacy adapter): message is
//    `"<reason> (engine error <status>)"`, reason verbatim — prefix-matched.
//  - `AgentsHttpError` (the SDK agent-write path: rename/create/delete) and
//    `ActivitiesHttpError` (the SDK activity-write path: mission create /
//    delete): the message is the gateway's RAW JSON body, so the reason is
//    parsed out of it. Renaming an asleep agent answered the same wake 503 but
//    escaped this classifier into the red toast + Sentry pipeline because only
//    the legacy shape was matched (HOUSTON-APP-536); a mission created against
//    a pod mid-roll did the same through the activities module, which carries
//    the body identically but wasn't in the name list (HOUSTON-APP-51X).
//  - `EngineError` (`@houston/runtime-client` — the per-agent runtime and the
//    pre-agent setup-runtime clients): carries the raw response text in
//    `body`, so the reason is parsed the same way. First-run provider login
//    against a setup pod still provisioning answered
//    `503 {"error":"engine unavailable","detail":"setup pod unreachable"}` but
//    escaped into the red toast + Sentry pipeline because this shape wasn't
//    matched (PRODUCT-1612 / HOUSTON-APP-4VN).
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
const RUNTIME_STILL_STARTING_503 =
  "the agent's runtime is still starting, try again shortly";
const ENGINE_PROXY_FAILED_502 = "engine proxy failed";
const AGENT_POD_UNUSABLE_502 = "agent pod unusable";

/** The SDK's per-module HTTP errors. Each carries the raw response body as its
 *  message, so they share one branch; a new SDK module's error joins here. */
const SDK_HTTP_ERROR_NAMES = new Set([
  "AgentsHttpError",
  "ActivitiesHttpError",
]);

/** The gateway `error` reason out of a raw response body (an SDK http error's
 *  message or an `EngineError` `body`); null when it isn't gateway JSON
 *  (an HTML error page, the synthetic `agents request failed: <status>`). */
function gatewayReason(body: string): string | null {
  if (!body.startsWith("{")) return null;
  try {
    const reason = (JSON.parse(body) as { error?: unknown } | null)?.error;
    return typeof reason === "string" ? reason : null;
  } catch {
    return null;
  }
}

/** The (status, reason) pairs every shape reads as "not there yet". */
function isWakingAnswer(
  status: unknown,
  matches: (reason: string) => boolean,
): boolean {
  if (status === 503) {
    return (
      matches(ENGINE_UNAVAILABLE_503) || matches(RUNTIME_STILL_STARTING_503)
    );
  }
  return status === 502 && matches(ENGINE_PROXY_FAILED_502);
}

/**
 * A "the agent's pod is not there right now" answer: the pod or its runtime
 * is warming up, restarting, or otherwise not accepting connections, and the
 * same request succeeds once it does. Matched structurally (name + status +
 * reason) so this stays dependency-free.
 */
export function isEngineWakingError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as { status?: unknown }).status;
  if (err.name === "HoustonEngineError") {
    return isWakingAnswer(status, (reason) => err.message.startsWith(reason));
  }
  if (SDK_HTTP_ERROR_NAMES.has(err.name)) {
    const reason = gatewayReason(err.message);
    if (reason === null) return false;
    return (
      isWakingAnswer(status, (r) => reason === r) ||
      (status === 502 && reason === AGENT_POD_UNUSABLE_502)
    );
  }
  if (err.name === "EngineError") {
    const body = (err as { body?: unknown }).body;
    const reason = typeof body === "string" ? gatewayReason(body) : null;
    if (reason === null) return false;
    return isWakingAnswer(status, (r) => reason === r);
  }
  return false;
}
