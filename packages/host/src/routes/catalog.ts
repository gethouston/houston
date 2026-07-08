import type { ServerResponse } from "node:http";
import { buildProviderCatalog } from "../providers/pi-catalog";
import { json } from "./http";

/**
 * `GET /v1/catalog` → 200 `ProviderCatalog`. pi-ai's full static, in-process
 * model catalog (every runnable provider + model) — the SAME on every deployment
 * (desktop and the managed cloud pod both serve the full pi-ai set; there is no
 * profile gating). Built from pi-ai's baked registry, so it needs no network and
 * no user scope — which is why it rides the public meta surface alongside
 * `/v1/capabilities`. Returns true when handled.
 */
export function handleCatalog(
  method: string,
  path: string,
  res: ServerResponse,
): boolean {
  if (method !== "GET" || path !== "/v1/catalog") return false;
  json(res, 200, buildProviderCatalog());
  return true;
}
