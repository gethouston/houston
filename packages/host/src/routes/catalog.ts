import { buildProviderCatalog } from "../providers/pi-catalog";
import { json } from "./http";
import { defineRoute } from "./registry";

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
