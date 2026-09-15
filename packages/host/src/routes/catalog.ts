import { buildProviderCatalog } from "../providers/pi-catalog";
import { json } from "./http";
import { defineRoute } from "./registry";

/**
 * `GET /v1/catalog` → 200 `ProviderCatalog`. pi-ai's full static, in-process
 * model catalog (every runnable provider + model) — the SAME on every deployment
 * (desktop and the managed cloud pod both serve the full pi-ai set; there is no
 * profile gating). Built from pi-ai's baked registry, so it needs no network and
 * no user scope — which is why it rides the public meta surface alongside
 * `/v1/capabilities`.
 */
defineRoute({
  group: "catalog",
  method: "GET",
  path: "/v1/catalog",
  phase: "public",
  classification: "infra",
  reason: "Static, user-agnostic model catalog on the pre-sign-in surface.",
  source: "packages/host/src/routes/catalog.ts",
  handler: ({ res }) => json(res, 200, buildProviderCatalog()),
});
