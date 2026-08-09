import type { Capabilities } from "../../../../../ui/engine-client/src/types";
import * as controlPlane from "../control-plane";
import type { AdapterContext } from "./context";
import { HoustonEngineError } from "./errors";

/**
 * The deployment's advertised capabilities (`GET /v1/capabilities`) — what the
 * SERVER says it is, which is the only honest answer to "am I talking to an open
 * host or to the cloud gateway" (a build-time flag can't tell: the desktop shell
 * sets `__HOUSTON_CP__` on every delivery path).
 *
 * Reached with `gatewayAuthFetch` rather than `this.engine.capabilities()` on
 * purpose: hosted mode rotates the bearer mid-session, so the live token is read
 * per attempt and a 401 refreshes + replays (HOU-687).
 */
export async function fetchCapabilities(
  ctx: AdapterContext,
): Promise<Capabilities> {
  const res = await controlPlane.gatewayAuthFetch(
    ctx.token,
    () => ctx.cp?.activeOrgSlug,
  )(`${ctx.baseUrl}/v1/capabilities`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new HoustonEngineError(res.status, body);
  }
  return (await res.json()) as Capabilities;
}
