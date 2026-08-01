/**
 * Detection for the `toolkit_oauth_unmanaged` connect rejection (HOU-1116:
 * twitter). The toolkit only offers OAuth and Composio has no managed app for
 * it, so connecting is impossible until an OAuth app is registered for it in
 * the Composio dashboard — an EXPECTED, operator-side state, not a Houston
 * bug. `call()` silences the generic red toast + Sentry report and the connect
 * flow explains it with its own copy instead.
 *
 * The code arrives in different shapes per deployment: the direct engine
 * adapter throws an `EngineError` whose `body`/message embed the host's JSON
 * (`{"error":..., "code":"toolkit_oauth_unmanaged"}`), while the cloud gateway
 * re-wraps that body under a `detail` string. A structured `code` read plus a
 * substring fallback covers both without coupling to either wrapper.
 */
export const TOOLKIT_OAUTH_UNMANAGED = "toolkit_oauth_unmanaged";

export function isUnconnectableToolkitError(err: unknown): boolean {
  const e = err as
    | { code?: unknown; body?: unknown; message?: unknown }
    | null
    | undefined;
  if (e?.code === TOOLKIT_OAUTH_UNMANAGED) return true;
  const body = e?.body;
  if (
    body &&
    typeof body === "object" &&
    (body as { code?: unknown }).code === TOOLKIT_OAUTH_UNMANAGED
  ) {
    return true;
  }
  if (typeof body === "string" && body.includes(TOOLKIT_OAUTH_UNMANAGED)) {
    return true;
  }
  return (
    typeof e?.message === "string" &&
    e.message.includes(TOOLKIT_OAUTH_UNMANAGED)
  );
}
