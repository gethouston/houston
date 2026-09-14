import type { Routine } from "@houston/protocol";
import type { PortablePackage } from "./portable";

/**
 * The identity a package takes on when it is INSTALLED into a new agent.
 *
 * A routine's id is global on the hosted profile: the gateway's trigger and
 * webhook tables are keyed by `routine_id` alone, and every pod's routines
 * sync replaces the row's owner with whichever agent wrote last. A copied or
 * twice-installed package that kept the source's ids would leave two agents
 * fighting over one row (PRODUCT-1808) — the copy's trigger status flips to
 * "couldn't confirm", its webhook mint 404s, and events route to whichever
 * agent synced last. So an install never reuses an id: each routine is
 * re-minted, and the old → new map is handed back so the caller can carry
 * the source's routine chats across (their keys are `routine-<id>`).
 *
 * A webhook `key_prefix` names an address minted for the SOURCE routine, so a
 * fresh identity drops it: the copy shows "Create webhook address" until it
 * mints its own, instead of claiming a key it does not hold.
 */
export interface InstallIdentity {
  pkg: PortablePackage;
  /** Source routine id → the installed routine's id. */
  routineIds: Record<string, string>;
}

const withoutMintedKey = (routine: Routine): Routine =>
  routine.trigger?.kind === "webhook" && routine.trigger.key_prefix
    ? { ...routine, trigger: { kind: "webhook" } }
    : routine;

export function remintRoutineIds(
  pkg: PortablePackage,
  mint: () => string,
): InstallIdentity {
  const routineIds: Record<string, string> = {};
  const routines = pkg.routines.map((routine) => {
    const id = mint();
    routineIds[routine.id] = id;
    return { ...withoutMintedKey(routine), id };
  });
  return { pkg: { ...pkg, routines }, routineIds };
}
