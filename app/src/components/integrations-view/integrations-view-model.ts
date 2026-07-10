import type { Capabilities } from "@houston-ai/engine-client";
import { isMultiplayer } from "../../lib/org-roles.ts";

/**
 * Pure, DOM-free page-mode split for the global Integrations page. Kept separate
 * so the one identity-per-mode rule is unit-tested in isolation.
 */

/** Which identity the global Integrations page takes for this caller. */
export type IntegrationsPageMode = "policy" | "personal";

/**
 * The Integrations page has exactly one identity per mode. In a Teams workspace
 * (multiplayer + `teams`) it is the org POLICY surface (the org-wide app
 * allowlist) — reachable only by owner/admin, since the nav gate hides it from
 * plain members. Everywhere else (single-player and non-Teams multiplayer) it is
 * the caller's PERSONAL connected-apps page. A cosmetic split: the gateway is the
 * real enforcer.
 */
export function integrationsPageMode(
  caps: Capabilities | null | undefined,
): IntegrationsPageMode {
  return isMultiplayer(caps) && caps?.teams === true ? "policy" : "personal";
}
