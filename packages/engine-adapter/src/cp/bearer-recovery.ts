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

const REJECTED_BEARER_LIMIT = 8;
const rejectedBearers: string[] = [];

export function noteBearerRejected(bearer: string): void {
  if (!bearer) return;
  const at = rejectedBearers.indexOf(bearer);
  if (at >= 0) rejectedBearers.splice(at, 1);
  rejectedBearers.push(bearer);
  if (rejectedBearers.length > REJECTED_BEARER_LIMIT) rejectedBearers.shift();
}

export function noteBearerAccepted(bearer: string): void {
  const at = rejectedBearers.indexOf(bearer);
  if (at >= 0) rejectedBearers.splice(at, 1);
}

export function wasBearerRejected(bearer: string): boolean {
  return rejectedBearers.includes(bearer);
}

export function resetRejectedBearers(): void {
  rejectedBearers.length = 0;
  resetRejectedMints();
  resetDiscardedBearers();
}

export const signedOutResponse = () =>
  new Response(JSON.stringify({ error: SIGNED_OUT_ERROR }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

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
