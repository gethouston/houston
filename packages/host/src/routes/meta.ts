import { PROTOCOL_VERSION } from "@houston/protocol";
import { version as HOST_VERSION } from "../../package.json";
import type { ControlPlaneDeps } from "../server";
import { json } from "./http";
import { defineRoute } from "./registry";

const SOURCE = "packages/host/src/routes/meta.ts";

export function healthBody(deps: Pick<ControlPlaneDeps, "storeFenced">): {
  status: "ok" | "fenced";
  storeFenced?: boolean;
} {
  const fenced = deps.storeFenced?.() ?? false;
  return {
    status: fenced ? "fenced" : "ok",
    ...(deps.storeFenced ? { storeFenced: fenced } : {}),
  };
}

defineRoute({
  group: "meta",
  method: "GET",
  path: "/health",
  phase: "public",
  classification: "infra",
  reason: "Liveness probe: no user identity, no domain payload.",
  source: SOURCE,
  handler: ({ deps, res }) => {
    const body = healthBody(deps);
    json(res, body.status === "fenced" ? 503 : 200, body);
  },
});

defineRoute({
  group: "meta",
  method: "GET",
  path: "/v1/version",
  phase: "public",
  classification: "infra",
  reason: "Build identity the cloud update manager compares pods against.",
  source: SOURCE,
  handler: ({ deps, res }) =>
    json(res, 200, {
      engine: "houston-host",
      version: HOST_VERSION,
      protocol: PROTOCOL_VERSION,
      build: process.env.BUILD_SHA || null,
      chatHistoryMigrated: deps.chatHistoryMigrated ?? false,
    }),
});

defineRoute({
  group: "meta",
  method: "GET",
  path: "/v1/capabilities",
  phase: "public",
  classification: "infra",
  reason: "The deployment describing itself; read before any sign-in.",
  source: SOURCE,
  handler: ({ deps, res }) => json(res, 200, deps.capabilities),
});
