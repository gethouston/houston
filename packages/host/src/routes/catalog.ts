import type { ServerResponse } from "node:http";
import type { Capabilities } from "@houston/protocol";
import { buildProviderCatalog } from "../providers/pi-catalog";
import { json } from "./http";

/**
 * `GET /v1/catalog` → 200 `ProviderCatalog`. pi-ai's full static, in-process
 * model catalog (every runnable provider + model), profile-gated: desktop/local
 * returns every provider; an egress-locked cloud profile returns only the ones it
 * can run (see `buildProviderCatalog`). Built from pi-ai's baked registry, so it
 * needs no network and no user scope — it is the same for everyone on a given
 * deployment, which is why it rides the public meta surface alongside
 * `/v1/capabilities`. Returns true when handled.
 */
export function handleCatalog(
  capabilities: Capabilities,
  method: string,
  path: string,
  res: ServerResponse,
): boolean {
  if (method !== "GET" || path !== "/v1/catalog") return false;
  json(res, 200, buildProviderCatalog(capabilities.profile));
  return true;
}
