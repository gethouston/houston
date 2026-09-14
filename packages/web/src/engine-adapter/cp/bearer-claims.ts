/**
 * Decode-only view of a gateway bearer for the 401 recovery's breadcrumbs.
 *
 * The transport never verifies a token (the gateway does, against Google's
 * JWKS); it only needs to DESCRIBE the bearer it just had refused, so the next
 * Sentry event can say whether the refresher handed back a freshly minted
 * token or a slept-out one (PRODUCT-1812). Shape-tolerant: anything that is
 * not a three-part JWT with a JSON payload yields `null`, never a throw, and
 * nothing here ever logs the token itself.
 */

export interface BearerDescription {
  /** Seconds until `exp`, negative once expired; null when the claim is absent. */
  expiresInS: number | null;
  /** Seconds since `iat`; null when the claim is absent. */
  issuedAgoS: number | null;
  /** The signing-key id from the header, or null. */
  kid: string | null;
}

function base64UrlToJson(segment: string): Record<string, unknown> | null {
  const pad =
    segment.length % 4 === 0 ? "" : "=".repeat(4 - (segment.length % 4));
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/") + pad;
  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function numberClaim(
  claims: Record<string, unknown>,
  key: string,
): number | null {
  const raw = claims[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/** Describe a bearer's timing claims relative to `nowMs` (default: now). */
export function describeBearer(
  bearer: string,
  nowMs: number = Date.now(),
): BearerDescription | null {
  const parts = bearer.split(".");
  if (parts.length !== 3) return null;
  const header = base64UrlToJson(parts[0]);
  const claims = base64UrlToJson(parts[1]);
  if (!claims) return null;
  const nowS = Math.floor(nowMs / 1000);
  const exp = numberClaim(claims, "exp");
  const iat = numberClaim(claims, "iat");
  const kid = header?.kid;
  return {
    expiresInS: exp === null ? null : exp - nowS,
    issuedAgoS: iat === null ? null : nowS - iat,
    kid: typeof kid === "string" ? kid : null,
  };
}

/** One-line, token-free rendering for a console breadcrumb. */
export function formatBearerDescription(
  description: BearerDescription | null,
): string {
  if (!description) return "not a JWT";
  const { expiresInS, issuedAgoS, kid } = description;
  return [
    `expires_in_s=${expiresInS ?? "?"}`,
    `issued_ago_s=${issuedAgoS ?? "?"}`,
    `kid=${kid ?? "?"}`,
  ].join(" ");
}
