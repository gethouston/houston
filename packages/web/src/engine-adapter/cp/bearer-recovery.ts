import { SIGNED_OUT_ERROR } from "../client/errors";
import { hasSessionRefresher, refreshLiveToken } from "../session-refresh";

/**
 * The 401 half of `gatewayAuthFetch` (`./fetch.ts`): what to do once the
 * gateway has rejected a bearer. Split out so the transport file stays
 * readable and so the one piece of state this needs — which bearers the
 * gateway has ALREADY rejected — has a single owner.
 *
 * Why that memory exists (PRODUCT-1737): on a wake-from-sleep burst the bearer
 * the gateway sees is not one value. Several parallel reads go out holding the
 * slept-out token, the proactive identity timer mints a new one on its own
 * schedule, and the seam's refresh answers a third caller. Comparing the
 * refresher's answer only with the bearer THIS request sent (`fresh ===
 * bearer`, PRODUCT-1664) cannot tell "the gateway has already rejected this
 * exact token on a sibling request" apart from "a genuinely new mint". The
 * first replay of a rejected mint stays loud — a fresh bearer the gateway
 * refuses is a real bug — but its siblings must not each file the same
 * report, and a request that only learned of the rejection from a sibling
 * must not fire a replay it already knows the answer to.
 */

/** Bearers the gateway has answered 401 to, newest last. Bounded: a session
 *  rotates through a handful of tokens per hour, and anything older than the
 *  last few is unreachable by a live request anyway. */
const REJECTED_BEARER_LIMIT = 8;
const rejectedBearers: string[] = [];

export function noteBearerRejected(bearer: string): void {
  if (!bearer) return;
  const at = rejectedBearers.indexOf(bearer);
  if (at >= 0) rejectedBearers.splice(at, 1);
  rejectedBearers.push(bearer);
  if (rejectedBearers.length > REJECTED_BEARER_LIMIT) rejectedBearers.shift();
}

/** A bearer the gateway accepted is provably usable again — a rejection is
 *  monotonic for an expired token, but a stale verifier key on one gateway
 *  replica is not, and the accepted answer is the newer fact. */
export function noteBearerAccepted(bearer: string): void {
  const at = rejectedBearers.indexOf(bearer);
  if (at >= 0) rejectedBearers.splice(at, 1);
}

export function wasBearerRejected(bearer: string): boolean {
  return rejectedBearers.includes(bearer);
}

/** Test seam: the memory is module-scoped on purpose (one transport per page). */
export function resetRejectedBearers(): void {
  rejectedBearers.length = 0;
}

/** True in hosted control-plane mode (the cloud web app and the desktop cloud
 *  profile both set the flag). Local hosts never set it, so the signed-out
 *  short-circuit cannot affect them. */
export const inControlPlaneMode = (): boolean =>
  typeof window !== "undefined" &&
  (window as { __HOUSTON_CP__?: boolean }).__HOUSTON_CP__ === true;

/** The local answer for a hosted call attempted with no session: the same 401
 *  shape a gateway rejection produces, minted WITHOUT a network round trip.
 *  Signed-out is an expected lifecycle state (the sign-in screen is already the
 *  surface), so hammering the gateway with unauthenticated requests would only
 *  produce console/toast noise — and the error-toast layer recognizes this body
 *  and stays quiet (HOU-1014). */
export const signedOutResponse = () =>
  new Response(JSON.stringify({ error: SIGNED_OUT_ERROR }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

const nextMacrotask = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Ask the session refresher for a bearer, giving a hosted page ONE extra
 * macrotask when the refresher is not installed at the instant a 401 lands.
 *
 * Observed in the field (PRODUCT-1737): after a laptop wake, the first 401
 * response processed found no refresher on the window and surfaced the
 * gateway's raw answer, while its sibling responses two milliseconds later
 * refreshed and replayed normally. The gap is a single turn of the event loop,
 * so that is what this waits — never longer, and never at all when the
 * refresher is where it belongs. A page that still has no refresher after the
 * tick is a static-token host or the pre-mount boot window, and the warn is
 * the breadcrumb that tells the next Sentry event which of the two it was.
 */
async function refreshBearer(): Promise<string | null> {
  const fresh = await refreshLiveToken();
  if (fresh || !inControlPlaneMode() || hasSessionRefresher()) return fresh;
  await nextMacrotask();
  if (hasSessionRefresher()) return refreshLiveToken();
  console.warn(
    "[gateway-auth] 401 with no session refresher installed on a hosted page; surfacing the gateway's answer as-is",
  );
  return null;
}

/**
 * Settle a gateway response: anything but a 401 stands (and clears its bearer
 * from the rejected memory); a 401 runs the refresh-and-replay recovery.
 */
export function settleGatewayResponse(
  res: Response,
  bearer: string,
  send: (bearer: string) => Promise<Response>,
): Promise<Response> {
  if (res.status !== 401) {
    noteBearerAccepted(bearer);
    return Promise.resolve(res);
  }
  return recoverFromUnauthorized(res, bearer, send);
}

/**
 * The 401 → refresh → replay seam proper (HOU-687), for a request that was
 * sent with `bearer` and answered `res` (a 401).
 *
 * An installed refresher answering null in hosted mode is its terminal verdict:
 * the session is gone (HOU-1106's three-valued contract) — an expected
 * lifecycle state, answered with the quiet synthetic signed-out 401 so a burst
 * of live queries caught holding the stale bearer doesn't file a report per
 * query while the sign-in screen mounts (HOUSTON-APP-4WR). With NO refresher
 * installed, null only means "nobody to ask" (static tokens, tests, the
 * pre-mount boot window), so the gateway's own 401 stands.
 *
 * A refresher answering a bearer the gateway has ALREADY rejected — the one
 * this request sent (securetoken hands back the still-cached idToken when
 * asked twice inside one token's lifetime, PRODUCT-1664) or one a sibling
 * request just had refused (PRODUCT-1737) — is not a mint worth replaying: the
 * answer is known. It takes the same quiet path. A genuinely NEW bearer is
 * replayed once, and a 401 to THAT replay is returned raw: a fresh bearer the
 * gateway rejects is a real bug that must surface. It is also remembered, so
 * the siblings sharing that mint go quiet instead of each replaying it.
 */
export async function recoverFromUnauthorized(
  res: Response,
  bearer: string,
  send: (bearer: string) => Promise<Response>,
): Promise<Response> {
  noteBearerRejected(bearer);
  const fresh = await refreshBearer();
  const quiet = () =>
    inControlPlaneMode() && hasSessionRefresher() ? signedOutResponse() : res;
  if (!fresh) return quiet();
  if (fresh === bearer || wasBearerRejected(fresh)) return quiet();
  const replay = await send(fresh);
  if (replay.status === 401) {
    noteBearerRejected(fresh);
    console.warn(
      "[gateway-auth] the gateway rejected a freshly minted bearer on replay",
    );
  } else {
    noteBearerAccepted(fresh);
  }
  return replay;
}
