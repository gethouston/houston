// The "what did personal-assistant discovery actually answer?" classifier.
// Dependency-free so it is node-testable directly
// (app/tests/assistant-availability.test.ts) and importable from anywhere.
//
// Sibling of `shared-skills-availability.ts` and `agent-gone.ts`: a small,
// typed reading of an engine error shape, used to decide how a failure is
// SURFACED — never to decide whether it is reported.

/** The host's code for "the gateway serves assistant discovery, not this
 *  engine" (501, `packages/host/src/routes/assistant.ts`). */
export const ASSISTANT_GATEWAY_ONLY = "assistant_gateway_only";
/** The host's code for "this host holds no agent tree, so it cannot hold an
 *  assistant" (503, same route). */
export const ASSISTANT_UNAVAILABLE = "assistant_unavailable";
/** The gateway's code for "no assistant credential is bound to this
 *  deployment" (503, `cloud/internal/edge/agents/assistant.go`). The
 *  credential IS the feature's switch, so this is a deployment shape. */
export const ASSISTANT_NOT_CONFIGURED = "not_configured";

/** Every code that DECLARES the feature absent. Presence of one is the answer,
 *  whatever the status carrying it. */
const UNSUPPORTED_CODES: ReadonlySet<string> = new Set([
  ASSISTANT_GATEWAY_ONLY,
  ASSISTANT_UNAVAILABLE,
  ASSISTANT_NOT_CONFIGURED,
]);

/**
 * What a failed `GET /v1/assistant` means.
 *
 * `unsupported` and `transient` both wear a 503 on the wire, and telling them
 * apart is the whole point of this module: one is a deployment that has no
 * assistant, the other is a pod that is not awake yet.
 */
export type AssistantDiscoveryFailure =
  /** This deployment serves no assistant. Settled, silent, never retried. */
  | { readonly kind: "unsupported" }
  /** The engine could not answer yet — a pod provisioning, waking or being
   *  torn down. Recoverable: another ask, moments later, succeeds. */
  | { readonly kind: "transient"; readonly retryAfterMs: number | null }
  /** A real failure: a 500, an auth rejection, a malformed answer, a throw
   *  that carries no status at all. Keeps the loud path. */
  | { readonly kind: "unexpected" };

/** The code the two transports carry: the web adapter passes the host's flat
 *  `{error, code}` through, the engine-client nests it under `error`. */
function errorCode(body: unknown): string | undefined {
  const b = body as { code?: unknown; error?: { code?: unknown } } | null;
  if (typeof b?.code === "string") return b.code;
  const nested = b?.error?.code;
  return typeof nested === "string" ? nested : undefined;
}

/** A retry hint only counts when it is a real, positive duration. */
function retryHint(err: object): number | null {
  const hint = (err as { retryAfterMs?: unknown }).retryAfterMs;
  return typeof hint === "number" && Number.isFinite(hint) && hint > 0
    ? hint
    : null;
}

/**
 * Read a discovery failure.
 *
 * Keyed on the STATUS and the body's CODE, never on the rendered message. 501
 * is the host's "discovery belongs to the gateway" and has no other meaning on
 * this route. A 503 is ambiguous by itself: the host and the gateway both name
 * their absence answers with a code, so a 503 that carries none is the
 * gateway's provisioning/wake answer (`{"error":"engine unavailable"}`), which
 * heals on its own.
 */
export function classifyAssistantDiscoveryFailure(
  err: unknown,
): AssistantDiscoveryFailure {
  if (!err || typeof err !== "object") return { kind: "unexpected" };
  const { status, body } = err as { status?: unknown; body?: unknown };
  const code = errorCode(body);
  if (code !== undefined && UNSUPPORTED_CODES.has(code)) {
    return { kind: "unsupported" };
  }
  if (status === 501) return { kind: "unsupported" };
  if (status === 503) {
    return { kind: "transient", retryAfterMs: retryHint(err) };
  }
  return { kind: "unexpected" };
}

/**
 * Whether a discovery failure is one we must NOT report as a Houston bug.
 *
 * Absence is not a failure, and a waking pod is not a failure either — both
 * are expected states of a healthy deployment, so `lib/tauri.ts` silences them
 * (the call is still logged). Everything left is `unexpected` and stays loud,
 * so the no-silent-failures policy holds. Expressed through the classifier so
 * the silence rule and the retry rule can never drift apart.
 */
export function isAssistantUnavailableError(err: unknown): boolean {
  return classifyAssistantDiscoveryFailure(err).kind !== "unexpected";
}

/**
 * Attempts a transient failure earns. Five tries spanning ~15s of client
 * patience (1s/2s/4s/8s), sized like the read transport's wake budget
 * (`packages/web/src/engine-adapter/cp/transient-retry.ts`): well past a
 * healthy pod boot, and bounded — a pod that has not come up by then is a
 * capacity problem, and discovery refetches on the next mount or focus anyway.
 */
export const ASSISTANT_TRANSIENT_RETRY_LIMIT = 4;
/** A real failure gets one blind retry: enough for a gateway roll's handoff,
 *  short enough that a genuine bug reaches the reporting path quickly. */
export const ASSISTANT_UNEXPECTED_RETRY_LIMIT = 1;
/** First backoff step; each attempt doubles it. */
export const ASSISTANT_RETRY_BASE_DELAY_MS = 1_000;
/** Floor for a server-advertised hint — never hammer the gateway. */
export const ASSISTANT_RETRY_MIN_DELAY_MS = 500;
/** Ceiling for both the backoff and a hint: waiting longer than this in one
 *  step outlives the screen the user is looking at. */
export const ASSISTANT_RETRY_MAX_DELAY_MS = 8_000;

/**
 * Whether discovery should be asked again after `failureCount` failures
 * (TanStack's `retry` predicate: 1 after the first failure).
 */
export function shouldRetryAssistantDiscovery(
  failureCount: number,
  err: unknown,
): boolean {
  switch (classifyAssistantDiscoveryFailure(err).kind) {
    case "unsupported":
      return false;
    case "transient":
      return failureCount <= ASSISTANT_TRANSIENT_RETRY_LIMIT;
    case "unexpected":
      return failureCount <= ASSISTANT_UNEXPECTED_RETRY_LIMIT;
  }
}

/**
 * How long to wait before retry `attempt` (TanStack's `retryDelay`: 0 for the
 * first retry). A hint the failure advertises wins over the backoff — the
 * server knows when its pod will be ready better than a curve does — clamped
 * so neither a `0` nor a `600000` from the wire can govern the schedule.
 */
export function assistantDiscoveryRetryDelayMs(
  attempt: number,
  err: unknown,
): number {
  const failure = classifyAssistantDiscoveryFailure(err);
  const hint = failure.kind === "transient" ? failure.retryAfterMs : null;
  if (hint !== null) {
    return Math.min(
      Math.max(hint, ASSISTANT_RETRY_MIN_DELAY_MS),
      ASSISTANT_RETRY_MAX_DELAY_MS,
    );
  }
  return Math.min(
    ASSISTANT_RETRY_BASE_DELAY_MS * 2 ** attempt,
    ASSISTANT_RETRY_MAX_DELAY_MS,
  );
}
