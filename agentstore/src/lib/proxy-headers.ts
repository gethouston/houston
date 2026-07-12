/**
 * Header helpers for the store's public artifact proxy routes (IR, install
 * instructions, Skill bundle). These routes exist to be fetched by arbitrary AI
 * assistants from any origin, so a wildcard CORS grant is intentional and safe:
 * GET-only, no credentials, only already-public published data. This is NOT a
 * duplicate of the gateway's CORS — it applies to the store's own routes.
 */

/** Wildcard CORS headers for a public GET artifact response. */
export function artifactCors(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

/** The preflight response for a public artifact route (no body, CORS headers). */
export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: artifactCors() });
}

/**
 * Best-effort client IP from a proxied request: the RIGHTMOST `X-Forwarded-For`
 * hop, else `X-Real-IP`, else "unknown". The ingress (Traefik) appends the real
 * client IP to the right of the chain; every entry to its left is client-supplied
 * and forgeable. Reading the rightmost hop matches the gateway's own rightmost-hop
 * policy, so the store forwards the honest downloader IP and an attacker cannot
 * mint a fresh install rate bucket by rotating a spoofed leftmost value.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const last = forwarded.split(",").at(-1)?.trim();
    if (last) return last;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
