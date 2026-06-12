/**
 * Google-signed ID tokens from the metadata server, for calling IAM-gated
 * Cloud Run services (the code sandbox is deployed --no-allow-unauthenticated).
 *
 * Works wherever a metadata server exists (Cloud Run, GKE with Workload
 * Identity, GCE). On a dev machine there is none, so the provider yields null
 * and the caller sends only the app-layer X-Sandbox-Token — enforcement is
 * SERVER-side: a missing ID token in production is rejected by Cloud Run IAM
 * and surfaces as the tool call's error, never silently.
 */

const METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

/** Decode a JWT's exp (ms epoch); 0 when unparsable (treated as expired). */
function tokenExpiryMs(jwt: string): number {
  try {
    const payload = jwt.split(".")[1] ?? "";
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: number;
    };
    return typeof claims.exp === "number" ? claims.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * A caching ID-token provider for one audience. Refreshes 5 minutes before
 * expiry. Returns null when no metadata server is reachable (local dev).
 */
export function makeIdTokenProvider(audience: string): () => Promise<string | null> {
  let cached: { token: string; expiresMs: number } | null = null;

  return async () => {
    if (cached && Date.now() < cached.expiresMs - 5 * 60_000) return cached.token;
    let res: Response;
    try {
      res = await fetch(
        `${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}&format=full`,
        { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(1500) },
      );
    } catch {
      return null; // no metadata server: dev machine. IAM enforcement is server-side.
    }
    if (!res.ok) {
      throw new Error(`metadata server refused an ID token (${res.status}): ${await res.text().catch(() => "")}`);
    }
    const token = (await res.text()).trim();
    cached = { token, expiresMs: tokenExpiryMs(token) };
    return token;
  };
}
