/**
 * The shared host v3 `fetch` used by the portable export/import flow and the
 * Agent Store publication orchestration. Kept in one place so both modules
 * apply the SAME live-bearer + 401 refresh/replay discipline and error shape.
 */

import { HoustonEngineError } from "./client";
import { type ControlPlaneConfig, gatewayAuthFetch } from "./control-plane";

/**
 * A host v3 request against `cfg.baseUrl`. `gatewayAuthFetch` reads the bearer
 * live per attempt and refreshes/replays once on a 401 (HOU-687); the
 * active-space selector (C8) is carried so a team-space agent's routes resolve
 * in the team namespace, not the caller's personal org. A non-2xx response
 * throws a `HoustonEngineError` carrying the parsed body.
 */
export async function hostFetch(
  cfg: ControlPlaneConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await gatewayAuthFetch(cfg.token, () => cfg.activeOrgSlug)(
    `${cfg.baseUrl}${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    },
  );
  if (!res.ok) {
    throw new HoustonEngineError(
      res.status,
      await res.json().catch(() => ({})),
    );
  }
  return res;
}
