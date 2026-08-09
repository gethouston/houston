/**
 * The bearer-refresh half of `./gateway-fetch.ts`, kept apart because it is the
 * app-side twin of ONE canonical module — the engine adapter's
 * `session-refresh.ts` (`packages/web/src/engine-adapter/`) — and the two must
 * stay recognisably the same: three-valued outcome, transient-failure
 * classification, single-flight latch. App code cannot import that one across
 * the package boundary (`pnpm check:boundaries`), so it is mirrored here.
 */

/**
 * A refresher failure that means "couldn't reach the identity service", not
 * "the session is gone" (HOU-1106): the desktop's typed
 * `IdentityError("network")`, the Firebase SDK's `auth/network-request-failed`,
 * or a raw fetch transport rejection (always a `TypeError`). Anything else is
 * terminal, so an unexpected refresher bug still surfaces as the 401 it
 * produced rather than being mislabelled as connectivity.
 */
function isTransientRefreshFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const code = (err as { code?: unknown } | null)?.code;
  return code === "network" || code === "auth/network-request-failed";
}

/** The one in-flight refresh, shared by every gateway call site: a 401 storm
 *  across N concurrent requests must collapse to a single token mint. Refresh
 *  tokens ROTATE on use, so racing mints can invalidate each other and sign the
 *  user out — the reason the canonical module holds the same latch.
 *  Module-level for the same reason it is there: each call site builds its deps
 *  per request off one set of globals, so there is nothing else to hang it on. */
let inflight: Promise<string | null> | null = null;

/**
 * One refresh attempt, joined to whichever one is already running. Resolves the
 * new bearer, or null when the session is terminally gone (a real sign-out —
 * the caller lets its 401 stand). A TRANSIENT failure THROWS the
 * transport-shaped `TypeError` that `lib/network-transport-error.ts` classifies
 * as connectivity (the "Load failed" prefix is what it keys on), exactly as the
 * canonical `refreshLiveToken` does: swallowing it to null turned every
 * sleep-wake refresh race into a bogus expired-session failure. The
 * classification is baked into the SHARED promise, so every joiner reads the
 * same outcome; a caller arriving after it settles starts a new one.
 */
export function refreshGatewayBearer(
  refresh: () => Promise<string | null>,
): Promise<string | null> {
  // The `async` wrapper is not decoration: it turns a refresher that throws
  // SYNCHRONOUSLY into the same rejection every other failure takes, so the
  // classification below can never be bypassed.
  inflight ??= (async () => refresh())()
    .catch((err: unknown) => {
      if (isTransientRefreshFailure(err))
        throw new TypeError("Load failed (session refresh)", { cause: err });
      return null;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
