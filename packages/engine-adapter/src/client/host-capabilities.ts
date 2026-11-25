import { getCapabilities } from "./boot-mixin";
import type { AdapterContext } from "./context";

export { getCapabilities };

// WHY: False only when the server says so; an absent flag or failed probe means served. ADR-0030
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
