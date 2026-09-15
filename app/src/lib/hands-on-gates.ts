import type { HandsOnSurface } from "@houston/protocol";
import type { SurfaceGates } from "./surface-gates-model.ts";

/**
 * Whether this person's Houston actually HOLDS the screen an errand points at.
 *
 * Billing and the Danger zone are the AI Manager's to hand over, and the
 * Manager speaks for the account rather than for this person's place in it: a
 * plain member has no Billing section, and only a space owner is shown the
 * Danger zone. An Open button leading to a screen that will not be there is a
 * dead end with the composer blocked behind it, so a gated destination reads as
 * not reachable from here and leaves the decline as the way on. The copy does
 * not blame the account: on a desktop or self-hosted build the screen does not
 * exist at all, and the same words stay true there.
 *
 * Everything else is ordinary work anyone in the space can finish: keys, their
 * own files, a routine's webhook.
 *
 * Kept pure (no hooks, no stores) so each rule is unit-tested the way
 * `surface-gates-model.ts` is.
 */
export function handsOnSurfaceReachable(
  surface: HandsOnSurface,
  gates: SurfaceGates,
): boolean {
  // Unsettled gates read as reachable: every flag is false while capabilities
  // load, and calling the screen missing on that evidence would flash
  // "unavailable" at the very person who owns it.
  if (!gates.ready) return true;
  if (surface === "billing") return gates.showOrganization && gates.showBilling;
  if (surface === "orgDanger") return gates.showWorkspaceDanger;
  return true;
}
