/**
 * What an event-driven routine still needs from the PERSON before it can fire.
 *
 * Two things a routine cannot do for itself: a Composio wake needs the app
 * connected on this account, and a webhook wake needs an address minted. An
 * installed listing's routines land with neither, so the surfaces that show a
 * routine (the activation chip) and the agent's own setup mission both ask this
 * module rather than each guessing from a status wire that has not settled yet.
 *
 * Pure and import-free so the node:test suite loads it directly.
 */

/** The wake binding shape both the live routine and the import preview carry. */
export interface WakeBinding {
  kind?: "composio" | "webhook";
  toolkit?: string;
}

export type RoutineSetupNeedKind = "connect_app" | "webhook_address";

export interface RoutineSetupNeed {
  routineName: string;
  kind: RoutineSetupNeedKind;
  /** The app's DISPLAY name ("Gmail"), never the machine slug — the agent reads
   *  this line out to a non-technical person. Absent for a webhook need. */
  appName?: string;
}

const isComposio = (binding: WakeBinding): boolean =>
  binding.kind !== "webhook" && typeof binding.toolkit === "string";

/**
 * The toolkit a Composio-bound routine needs connected, or null when nothing is
 * missing. `connectedToolkits` is `null` while the account's connections are
 * unknown (still loading, or a deployment with no integrations): unknown is
 * never reported as missing, so the UI cannot accuse a healthy routine.
 */
export function routineConnectNeed(
  binding: WakeBinding | undefined,
  connectedToolkits: string[] | null,
): string | null {
  if (!binding || !isComposio(binding) || connectedToolkits === null)
    return null;
  const toolkit = binding.toolkit ?? "";
  return connectedToolkits.includes(toolkit) ? null : toolkit;
}

/**
 * Every routine in a just-installed package that the person still has to
 * activate. Schedule routines never appear: a clock needs nothing. `appName`
 * resolves a toolkit slug to its real display name.
 */
export function pendingRoutineSetup(
  routines: Array<{ name: string; trigger?: WakeBinding }>,
  connectedToolkits: string[] | null,
  appName: (toolkit: string) => string,
): RoutineSetupNeed[] {
  const out: RoutineSetupNeed[] = [];
  for (const routine of routines) {
    const binding = routine.trigger;
    if (!binding) continue;
    if (binding.kind === "webhook") {
      out.push({ routineName: routine.name, kind: "webhook_address" });
      continue;
    }
    const toolkit = routineConnectNeed(binding, connectedToolkits);
    if (toolkit)
      out.push({
        routineName: routine.name,
        kind: "connect_app",
        appName: appName(toolkit),
      });
  }
  return out;
}
