import { json } from "./http";
import { defineRoute } from "./registry";

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
