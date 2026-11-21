import { getCapabilities } from "./boot-mixin";
import type { AdapterContext } from "./context";

export { getCapabilities };

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
