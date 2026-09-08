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
 *  assistant" (501, same route). */
export const ASSISTANT_UNAVAILABLE = "assistant_unavailable";
/** The gateway's code for "no assistant credential is bound to this
 *  deployment" (503, `cloud/internal/edge/agents/assistant.go`). The
 *  credential IS the feature's switch, so this is a deployment shape. */
export const ASSISTANT_NOT_CONFIGURED = "not_configured";

/** Every code that DECLARES the feature absent. */
const UNSUPPORTED_CODES: ReadonlySet<string> = new Set([
  ASSISTANT_GATEWAY_ONLY,
  ASSISTANT_UNAVAILABLE,
  ASSISTANT_NOT_CONFIGURED,
]);

/**
 * The statuses that can carry an answer ABOUT the assistant's existence: the
 * two "not implemented here" answers and the gateway's "not ready / not
 * configured" one. A code is only believed on one of these — a 500 or a 401
 * that happens to echo an absence string is a real failure wearing a borrowed
 * name, and reading it as absence would hide a broken deployment behind a
 * missing rail row.
 */
const ABSENCE_STATUSES: ReadonlySet<number> = new Set([404, 501, 503]);

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
 * Keyed on the STATUS and the body's CODE, never on the rendered message.
 *
 *  - **501** is "this engine does not implement discovery" — the host's answer
 *    both when a gateway fronts it and when it holds no agent tree at all
 *    (`packages/host/src/routes/assistant.ts`). It has no other meaning here.
 *  - **404** is a GATEWAY THAT PREDATES THE ROUTE: an unrouted path answers a
 *    plain-text `404 page not found`, no JSON and no code. Absence, exactly
 *    like a 501 — reading it as a real failure cost every user on such a
 *    deployment a retry ladder and a crash report per session.
 *  - **503** is ambiguous by itself: the host and the gateway both name their
 *    absence answers with a code, so a 503 that carries none is the gateway's
 *    provisioning/wake answer (`{"error":"engine unavailable"}`), which heals
 *    on its own.
 *
 * Everything else is a real failure and stays loud.
 */
export function classifyAssistantDiscoveryFailure(
  err: unknown,
): AssistantDiscoveryFailure {
  if (!err || typeof err !== "object") return { kind: "unexpected" };
  const { status, body } = err as { status?: unknown; body?: unknown };
  if (typeof status !== "number" || !ABSENCE_STATUSES.has(status)) {
    return { kind: "unexpected" };
  }
  const code = errorCode(body);
  if (code !== undefined && UNSUPPORTED_CODES.has(code)) {
    return { kind: "unsupported" };
  }
  if (status === 503)
    return { kind: "transient", retryAfterMs: retryHint(err) };
  return { kind: "unsupported" };
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
