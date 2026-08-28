/**
 * The typed reasons the host refuses to mint a connect link — expected
 * business states, not crashes. The host tags each with a stable `code` in its
 * 400 body (`composio-auth-config.ts`); the connect flow keys friendly copy on
 * them instead of relaying operator remedies to an end user, and the engine
 * call silences them from Sentry:
 *
 *  - `toolkit_oauth_unavailable` — the toolkit only offers OAuth and no OAuth
 *    app is registered for it yet (HOU-1110: highlevel), a Houston-side setup
 *    gap the user can do nothing about.
 *  - `toolkit_no_auth` — the toolkit needs no account at all; its tools
 *    already work (HOUSTON-APP-4Z1: agents authored connect cards for the
 *    no-auth "composio" toolkit itself, and every click ended in this 400).
 */
export const TOOLKIT_OAUTH_UNAVAILABLE = "toolkit_oauth_unavailable";
export const TOOLKIT_NO_AUTH = "toolkit_no_auth";

/** The transitional match for a cloud gateway that predates the typed code: it
 *  still relays the raw auth-config error as a 500 whose `detail` carries this
 *  marker. Remove once the gateway's counterpart change is deployed. */
const LEGACY_DETAIL_MARKER = "only offers OAuth";

/**
 * The refusal body carried by a thrown connect error, or `null` when the error
 * carries none. Duck-typed on the error's `body` (raw text from the local
 * runtime-client's `EngineError`, parsed JSON from the cloud control plane's
 * `HoustonEngineError`) — this app-level helper must not import either class.
 */
function refusalBody(
  err: unknown,
): { code?: unknown; detail?: unknown } | null {
  if (!err || typeof err !== "object" || !("body" in err)) return null;
  let body = (err as { body?: unknown }).body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  return (body ?? {}) as { code?: unknown; detail?: unknown };
}

/**
 * True when a thrown connect error means the toolkit cannot be connected until
 * Houston registers an OAuth app for it.
 */
export function isToolkitOauthUnavailableError(err: unknown): boolean {
  const body = refusalBody(err);
  if (!body) return false;
  if (body.code === TOOLKIT_OAUTH_UNAVAILABLE) return true;
  return (
    typeof body.detail === "string" &&
    body.detail.includes(LEGACY_DETAIL_MARKER)
  );
}

/**
 * True when a thrown connect error means the toolkit never needed connecting:
 * it holds no accounts and its tools work as-is.
 */
export function isToolkitNoAuthError(err: unknown): boolean {
  return refusalBody(err)?.code === TOOLKIT_NO_AUTH;
}
