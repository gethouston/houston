/**
 * Pod-side reading of the gateway-minted acting-as header (C2).
 *
 * The gateway stamps `x-houston-acting-as: acting-v1.<payloadB64Url>.<sig>` on
 * every request it proxies to a managed pod; the payload names the driving
 * user. A pod cannot VERIFY the signature — the HMAC secret never leaves the
 * gateway — so decoding is safe only where a trusted gateway fronts every
 * request (gatewayFronted), the same stance under which the raw header is
 * already relayed to the runtime. On the desktop an inbound acting header is
 * untrusted client input and must never reach this decode.
 */

import type { IncomingMessage } from "node:http";
import type { ActivityContributor } from "@houston/protocol";
import type { UserId } from "../domain/types";

/** The gateway-minted acting-as identity header (C2), lowercase for Node's
 *  IncomingMessage.headers. */
export const ACTING_AS_HEADER = "x-houston-acting-as";

const PREFIX = "acting-v1";

/**
 * Decode the acting-v1 header payload, or null for anything malformed (wrong
 * prefix, bad base64, non-JSON). Never throws. No signature verify — the pod
 * cannot (the HMAC secret never leaves the gateway); the gateway is the trust
 * boundary. Expiry is deliberately not checked: the gateway minted the token on
 * this very request, and the identity is recorded as attribution the gateway
 * re-authorizes at fire time, not used as a live credential.
 */
function decodeActingPayload(
  value: unknown,
): { sub?: unknown; name?: unknown } | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX || !parts[1]) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      sub?: unknown;
      name?: unknown;
    };
  } catch {
    return null;
  }
}

/**
 * The `sub` claimed by an acting-as header value, or undefined for anything
 * malformed (wrong prefix, bad base64, non-JSON, missing/empty sub). Never
 * throws — a garbled header reads as "no acting identity", the same as absent.
 */
export function actingSubFromHeader(
  value: string | string[] | undefined,
): string | undefined {
  const payload = decodeActingPayload(value);
  return payload && typeof payload.sub === "string" && payload.sub
    ? payload.sub
    : undefined;
}

/**
 * The acting-as identity as an ActivityContributor ({user_id, name?}), or null
 * for anything malformed / missing sub. Same tolerance as actingSubFromHeader —
 * the gateway is the trust boundary, so the payload is decoded, never verified.
 * `name` rides through only when it is a non-empty string.
 */
export function actingAuthorFromHeader(
  value: unknown,
): ActivityContributor | null {
  const payload = decodeActingPayload(value);
  if (!payload || typeof payload.sub !== "string" || !payload.sub) return null;
  return typeof payload.name === "string" && payload.name
    ? { user_id: payload.sub, name: payload.name }
    : { user_id: payload.sub };
}

/** What a request's acting identity depends on: only whether a trusted gateway
 *  minted the header, and who to fall back to when it minted none. */
interface ActingDeps {
  gatewayFronted?: boolean;
  ownerSub?: string;
}

/**
 * The acting human as a full contributor, stamped onto missions (activity
 * create/PATCH + turns). CRITICAL: null off the gateway (desktop/self-host),
 * so single-player activity.json gains no attribution keys and stays
 * byte-identical. Does NOT change the routine actor below.
 */
export function actingAuthorFor(
  deps: ActingDeps,
  req: IncomingMessage,
): ActivityContributor | null {
  return deps.gatewayFronted
    ? actingAuthorFromHeader(req.headers[ACTING_AS_HEADER])
    : null;
}

/**
 * WHO a routine write records as its acting identity (C2). A gateway-fronted
 * pod authenticates every request as its single local user, and that id has no
 * membership upstream — a routine stamped with it 401s every integration call
 * when it fires (HOU-689). The gateway minted the acting-as header for exactly
 * this: its sub is the identity the gateway re-authorizes at fire time. On the
 * desktop the header is untrusted client input, so the local userId stays the
 * recorded creator (routine turns there authenticate with the frontend session
 * instead). A gateway-fronted request with no decodable header falls back to
 * the org owner: an authorless routine is not fireable by the control-plane
 * planner, so SOME real, re-authorizable identity must always be recorded.
 */
export function routineActorFor(
  deps: ActingDeps,
  req: IncomingMessage,
  userId: UserId,
): string | undefined {
  return deps.gatewayFronted
    ? (actingSubFromHeader(req.headers[ACTING_AS_HEADER]) ?? deps.ownerSub)
    : userId;
}
