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

/**
 * Deployment-level capability flags the adapter consults BEFORE a request the
 * deployment may not serve (PRODUCT-1474: `agentConfigLibrary`,
 * `integrationSessionSink`). These describe the deployment, not the active
 * space, so one fetch per endpoint is enough; `AdapterContext.setEndpoint`
 * clears the memo because the new endpoint may be a different deployment.
 *
 * Tri-state on purpose: `false` only when the server EXPLICITLY says so. An
 * absent flag (a gateway or host that predates it) and a failed probe both
 * resolve `true`, keeping the caller on its legacy probe-and-swallow-404 path
 * rather than silently dropping a request on a guess. A failed probe is also
 * forgotten, so the next call asks again.
 */
export function deploymentServes(
  ctx: AdapterContext,
  flag: "agentConfigLibrary" | "integrationSessionSink",
): Promise<boolean> {
  ctx.deploymentCaps ??= fetchCapabilities(ctx).catch((err) => {
    console.warn("[capabilities] deployment probe failed", err);
    ctx.deploymentCaps = undefined;
    return null;
  });
  return ctx.deploymentCaps.then((caps) => caps?.[flag] !== false);
}
