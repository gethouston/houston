import { PROTOCOL_VERSION } from "@houston/protocol";
// Build-time constant: esbuild inlines the JSON import into the bundle (and
// vitest/tsx resolve it the same way), so the served version can never drift
// from the package.json that shipped it.
import { version as HOST_VERSION } from "../../package.json";
import type { ControlPlaneDeps } from "../server";
import { json } from "./http";
import { defineRoute } from "./registry";

/**
 * The public meta surface: health plus the v3 descriptors the UI reads BEFORE
 * sign-in to shape itself. Capabilities are not secrets, so none of these sits
 * behind the bearer wall — which is exactly what makes them `infra` rather
 * than an SDK surface.
 */
const SOURCE = "packages/host/src/routes/meta.ts";

export function healthBody(deps: Pick<ControlPlaneDeps, "storeFenced">): {
  status: "ok";
  storeFenced?: boolean;
} {
  return {
    status: "ok",
    ...(deps.storeFenced ? { storeFenced: deps.storeFenced() } : {}),
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
  // The gateway may use storeFenced to change routing/readiness later. This
  // only surfaces the state and deliberately keeps health at 200.
  handler: ({ deps, res }) => json(res, 200, healthBody(deps)),
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
      // The host package's semver — bumped when something meaningful ships,
      // so the cloud update manager can compare pods against the current release.
      version: HOST_VERSION,
      protocol: PROTOCOL_VERSION,
      // The exact git commit this image was built from (engine-pod-image.yml
      // bakes BUILD_SHA into the engine-pod target); null on builds that don't
      // set it (self-host, local dev).
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
