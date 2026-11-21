import type { Routine } from "@houston/protocol";
import type { PortablePackage } from "./portable";

export interface InstallIdentity {
  pkg: PortablePackage;
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
