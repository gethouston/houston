import { getCapabilities } from "./boot-mixin";
import type { AdapterContext } from "./context";

// The declaration lives in `boot-mixin.ts` — only `*-mixin.ts` files under
// `client/` are scanned by the assistant-catalog generator, so an operation
// declared here would never be published. Re-exported so the non-mixin callers
// (the local-model bridge and `deploymentServes` below)
// keep one import site for the deployment's own description.
export { getCapabilities };

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
  ctx.deploymentCaps ??= getCapabilities(ctx).catch((err) => {
    console.warn("[capabilities] deployment probe failed", err);
    ctx.deploymentCaps = undefined;
    return null;
  });
  return ctx.deploymentCaps.then((caps) => caps?.[flag] !== false);
}
