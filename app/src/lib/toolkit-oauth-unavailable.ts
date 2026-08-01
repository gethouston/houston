/**
 * The typed reason a connect was refused because the toolkit only offers OAuth
 * and no OAuth app is registered for it (HOU-1110: highlevel) — a Houston-side
 * setup gap, not a user error and not a crash. The host tags it with a stable
 * `code` in its 400 body (`composio-auth-config.ts`); the connect flow keys
 * friendly copy on it instead of relaying the operator remedy to an end user.
 */
export const TOOLKIT_OAUTH_UNAVAILABLE = "toolkit_oauth_unavailable";

/** The transitional match for a cloud gateway that predates the typed code: it
 *  still relays the raw auth-config error as a 500 whose `detail` carries this
 *  marker. Remove once the gateway's counterpart change is deployed. */
const LEGACY_DETAIL_MARKER = "only offers OAuth";

/**
 * True when a thrown connect error means the toolkit cannot be connected until
 * Houston registers an OAuth app for it. Duck-typed on the error's `body`
 * (raw text from the local runtime-client's `EngineError`, parsed JSON from the
 * cloud control plane's `HoustonEngineError`) — this app-level helper must not
 * import either class.
 */
export function isToolkitOauthUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("body" in err)) return false;
  let body = (err as { body?: unknown }).body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return false;
    }
  }
  const { code, detail } = (body ?? {}) as {
    code?: unknown;
    detail?: unknown;
  };
  if (code === TOOLKIT_OAUTH_UNAVAILABLE) return true;
  return typeof detail === "string" && detail.includes(LEGACY_DETAIL_MARKER);
}
