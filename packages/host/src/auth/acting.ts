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

/** The gateway-minted acting-as identity header (C2), lowercase for Node's
 *  IncomingMessage.headers. */
export const ACTING_AS_HEADER = "x-houston-acting-as";

const PREFIX = "acting-v1";

/**
 * The `sub` claimed by an acting-as header value, or undefined for anything
 * malformed (wrong prefix, bad base64, non-JSON, missing/empty sub). Never
 * throws — a garbled header reads as "no acting identity", the same as absent.
 * Expiry is deliberately not checked: the gateway minted the token on this very
 * request, and the sub is recorded as attribution the gateway re-authorizes at
 * routine fire time (membership + assignment), not used as a live credential.
 */
export function actingSubFromHeader(
  value: string | string[] | undefined,
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX || !parts[1]) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub
      ? payload.sub
      : undefined;
  } catch {
    return undefined;
  }
}
