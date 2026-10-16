import { SIGNED_OUT_ERROR } from "../client/errors";
import { jwtSub } from "../conversation-cache-identity";
import { hasSessionRefresher } from "../session-refresh";
import {
  inControlPlaneMode,
  refreshUsableBearer,
  resetDiscardedBearers,
} from "./refresh-bearer";
import { resetRejectedMints, settleRejectedMint } from "./rejected-mint";

export { inControlPlaneMode };

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
  resetRejectedMints();
  resetDiscardedBearers();
}

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
 * Settle a response whose request must never go out under another person
 * (`@houston/sdk/auth-replay`): a 401 is replayed once only when the refreshed
 * bearer names the same person as the one the gateway refused (a stale token
 * after sleep heals); any other answer, or a refresh for someone else, stands.
 */
export async function settleWithoutReplay(
  res: Response,
  bearer: string,
  send: (bearer: string) => Promise<Response>,
): Promise<Response> {
  if (res.status !== 401) {
    noteBearerAccepted(bearer);
    return res;
  }
  noteBearerRejected(bearer);
  const person = jwtSub(bearer);
  const fresh = person ? await refreshUsableBearer() : null;
  if (
    !fresh ||
    fresh === bearer ||
    wasBearerRejected(fresh) ||
    jwtSub(fresh) !== person
  )
    return res;
  const replay = await send(fresh);
  if (replay.status === 401) noteBearerRejected(fresh);
  else noteBearerAccepted(fresh);
  return replay;
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
 * replayed once; a 401 to THAT replay is verified once more after a beat, and
 * only a bearer refused twice is returned raw — by one caller, so a fresh mint
 * the gateway keeps rejecting still surfaces as the real bug it is, without a
 * report per query (PRODUCT-1812). A refreshed bearer whose own `exp` is
 * already past never reaches that path at all: `./refresh-bearer.ts` asks the
 * refresher once more before anything is sent (HOUSTON-APP-5HZ).
 */
export async function recoverFromUnauthorized(
  res: Response,
  bearer: string,
  send: (bearer: string) => Promise<Response>,
): Promise<Response> {
  noteBearerRejected(bearer);
  const fresh = await refreshUsableBearer();
  const quiet = () =>
    inControlPlaneMode() && hasSessionRefresher() ? signedOutResponse() : res;
  if (!fresh) return quiet();
  if (fresh === bearer || wasBearerRejected(fresh)) return quiet();
  const replay = await send(fresh);
  if (replay.status !== 401) {
    noteBearerAccepted(fresh);
    return replay;
  }
  // A refused mint is not believed on its first answer (PRODUCT-1812): one
  // owner per bearer verifies it after a beat, siblings reuse the verdict, and
  // a bearer refused twice goes loud exactly once (`./rejected-mint.ts`).
  noteBearerRejected(fresh);
  return settleRejectedMint({
    replay,
    bearer: fresh,
    previousBearer: bearer,
    send,
    quiet,
    noteAccepted: noteBearerAccepted,
    noteRejected: noteBearerRejected,
  });
}
