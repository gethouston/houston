// The "is this failure just the agent's pod waking up?" classifier for the
// error-surfacing layer (HOU-1114). Dependency-free so it is node-testable
// directly (app/tests/engine-waking-error.test.ts) and importable from
// anywhere.
//
// On the hosted profile the gateway answers a per-agent request with
// `503 {"error": "engine unavailable"}` when the agent's engine pod is not
// reachable yet — a freshly installed store agent still provisioning, or an
// asleep pod mid cold-start. The request self-heals on retry once the pod is
// up; nothing in Houston broke, so the red "we have a problem" bug toast +
// Sentry report is the wrong surface (a user who just installed an agent read
// it as the install failing). Keyed on the exact gateway reason string, NOT on
// bare status 503: other 503 bodies ("setup pod unreachable", provider quota
// pages, self-host proxies) carry different reasons and must keep surfacing as
// real errors.

/**
 * A gateway "engine unavailable" 503: the agent's engine pod is warming up or
 * unreachable, and the same request succeeds once it wakes. Matched
 * structurally (name + status + message prefix) so this stays dependency-free;
 * `HoustonEngineError` mints the message as `"<reason> (engine error <status>)"`
 * with the gateway's reason verbatim.
 */
export function isEngineWakingError(err: unknown): boolean {
  if (!(err instanceof Error) || err.name !== "HoustonEngineError") {
    return false;
  }
  const status = (err as { status?: unknown }).status;
  return status === 503 && err.message.startsWith("engine unavailable");
}
