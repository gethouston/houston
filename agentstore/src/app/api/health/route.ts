/**
 * GET /api/health — liveness/readiness probe for the store web tier.
 *
 * Deliberately dependency-free: it touches neither the gateway nor any database,
 * so it proves the Next server process is up and serving without coupling pod
 * health to the gateway's availability (a gateway blip must never restart-loop
 * the whole web tier). The Kubernetes readiness/liveness probes target this path.
 */

export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
