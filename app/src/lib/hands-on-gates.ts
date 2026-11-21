import type { HandsOnSurface } from "@houston/protocol";
import type { SurfaceGates } from "./surface-gates-model.ts";

export function handsOnSurfaceReachable(
  surface: HandsOnSurface,
  gates: SurfaceGates,
  agentSettings?: boolean,
): boolean {
  if (!gates.ready) return true;
  if (surface === "billing") return gates.showOrganization && gates.showBilling;
  if (surface === "orgDanger") return gates.showWorkspaceDanger;
  if (surface === "apiKeys") return gates.showApiKeys;
  if (surface === "agentApiAccess")
    return gates.showApiKeys && agentSettings !== false;
  return true;
}
