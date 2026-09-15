import { json } from "./http";
import { defineRoute } from "./registry";

/**
 * Prometheus text exposition of the boot-span ledger (HOU-1011). Pods are never
 * scraped in production (they push boot reports to the gateway); this route is
 * the local/debug window onto the same numbers. A host without telemetry wired
 * answers 404 rather than an empty exposition — a test server stays honest.
 */
defineRoute({
  group: "metrics",
  method: "GET",
  path: "/metrics",
  phase: "user",
  classification: "infra",
  reason: "Prometheus exposition of process telemetry; not a domain resource.",
  source: "packages/host/src/routes/metrics.ts",
  handler: async ({ deps, res }) => {
    if (!deps.metrics) return json(res, 404, { error: "not found" });
    const body = await deps.metrics.render();
    res.writeHead(200, { "content-type": deps.metrics.contentType });
    res.end(body);
  },
});
