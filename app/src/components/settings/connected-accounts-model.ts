import type { Capabilities } from "@houston-ai/engine-client";
import { canSeeIntegrationsPage, isMultiplayer } from "../../lib/org-roles.ts";

/**
 * How the Connected accounts section offers connecting MORE apps:
 *  - `"link"` — a link to the global Integrations page, which still hosts the
 *    catalog (single-player and non-Teams multiplayer).
 *  - `"hint"` — a muted "connect from an agent's Integrations tab" line, for a
 *    Teams host where the global page became admin policy (no catalog to reach)
 *    or is hidden from the caller entirely (a plain member).
 * Pure so the branch is unit-testable.
 */
export type ConnectAffordance = "link" | "hint";

export function connectAffordance(
  caps: Capabilities | null | undefined,
): ConnectAffordance {
  const teamsHost = isMultiplayer(caps) && caps?.teams === true;
  return canSeeIntegrationsPage(caps) && !teamsHost ? "link" : "hint";
}
