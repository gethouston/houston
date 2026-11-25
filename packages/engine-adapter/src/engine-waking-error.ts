const ENGINE_UNAVAILABLE_503 = "engine unavailable";
const RUNTIME_STILL_STARTING_503 =
  "the agent's runtime is still starting, try again shortly";
const HOST_SHUTTING_DOWN_503 = "the host is shutting down; retry shortly";
const ENGINE_PROXY_FAILED_502 = "engine proxy failed";
const AGENT_POD_UNUSABLE_502 = "agent pod unusable";

const SDK_HTTP_ERROR_NAMES = new Set([
  "AgentsHttpError",
  "ActivitiesHttpError",
]);

export function gatewayReason(body: string): string | null {
  if (!body.startsWith("{")) return null;
  try {
    const reason = (JSON.parse(body) as { error?: unknown } | null)?.error;
    return typeof reason === "string" ? reason : null;
  } catch {
    return null;
  }
}

function isWakingAnswer(
  status: unknown,
  matches: (reason: string) => boolean,
): boolean {
  if (status === 503) {
    return (
      matches(ENGINE_UNAVAILABLE_503) ||
      matches(RUNTIME_STILL_STARTING_503) ||
      matches(HOST_SHUTTING_DOWN_503)
    );
  }
  return status === 502 && matches(ENGINE_PROXY_FAILED_502);
}

// WHY: Match exact status and reason pairs; a bare 502 or 503 is a real failure. ADR-0030
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
