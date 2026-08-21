/**
 * Whether the AI account a routine will RUN ON is usable — answered BEFORE any
 * run, not after one fails (PRODUCT-1475).
 *
 * A routine has no composer to fail in front of: it fires unattended, so the
 * only place its provider can be shown as broken is the screen where it is
 * read and edited. This module is the single mapping from a probed
 * `ProviderStatus` to what that screen renders.
 *
 * WHOSE credential (the scope rule). `/providers` answers for the VIEWER's own
 * credential scope, while a fired routine runs on its CREATOR's. So the badge
 * is a claim the viewer's probe can only support for the viewer's OWN routines
 * — {@link viewerIsRoutineCreator} is the gate, and a routine someone else
 * created gets a neutral "runs on the creator's account" line instead of a
 * badge that would be answering a different question.
 *
 * `health` is richer than `authenticated` (a credential can be valid yet out of
 * credits) and is absent on engines that predate it, so the fallback below
 * reads exactly what every pre-PRODUCT-1475 surface read. `unreachable` is the
 * probe saying "I could not confirm", which renders as the neutral `checking`
 * — never as a healthy or a broken claim (the HOU-979 rule).
 *
 * Pure + DOM/i18n-free so every state is unit-tested without a renderer
 * (`app/tests/routine-provider-health.test.ts`).
 */

import type { ProviderHealth } from "@houston-ai/engine-client";

/**
 * What the routine's connection badge shows. The wire's five `ProviderHealth`
 * values, with `unreachable` collapsed into the neutral `checking` the rest of
 * the app already uses for an unconfirmable probe.
 */
export type RoutineProviderHealth =
  | "connected"
  | "not_connected"
  | "needs_reconnect"
  | "out_of_credits"
  | "checking";

/**
 * The minimal probe shape this derivation needs, spelled locally (like
 * `provider-connection.ts`) so the module stays dependency-light and both the
 * app's `ProviderStatus` and a hand-built test fixture pass in.
 */
export interface RoutineProviderStatusLike {
  authenticated?: boolean;
  auth_state?: "authenticated" | "unauthenticated" | "unknown";
  health?: ProviderHealth;
}

/** Health the badge renders. No status yet = still probing = `checking`. */
export function routineProviderHealth(
  status: RoutineProviderStatusLike | undefined,
): RoutineProviderHealth {
  if (!status) return "checking";
  if (status.health) {
    return status.health === "unreachable" ? "checking" : status.health;
  }
  // Older engine: no `health` field at all. Read the tri-state exactly as the
  // rest of the app does — `unknown` is "could not confirm", never "signed
  // out" — and fall back to the denormalized boolean for the rest.
  if (status.auth_state === "unknown") return "checking";
  return status.authenticated ? "connected" : "not_connected";
}

/**
 * The routine cannot run as things stand. Drives the compact warning chip on
 * list rows, which exists to say "this one will fail" before it does — so
 * `checking` is deliberately excluded: an unconfirmable probe is not evidence.
 */
export function routineHealthBlocksRun(health: RoutineProviderHealth): boolean {
  return (
    health === "not_connected" ||
    health === "needs_reconnect" ||
    health === "out_of_credits"
  );
}

/**
 * Connecting (or reconnecting) the provider is the remedy. `out_of_credits` is
 * excluded on purpose: the credential is already connected, so a Connect button
 * would relaunch a sign-in that changes nothing.
 */
export function routineHealthOffersConnect(
  health: RoutineProviderHealth,
): boolean {
  return health === "not_connected" || health === "needs_reconnect";
}

/**
 * Whether the viewer's own `/providers` answer describes the account this
 * routine would fire on. True when the routine names no creator (single-player:
 * there is one account and it is the viewer's) or names the viewer.
 */
export function viewerIsRoutineCreator(
  createdBy: string | undefined,
  viewerId: string | null | undefined,
): boolean {
  if (!createdBy) return true;
  return !!viewerId && createdBy === viewerId;
}
