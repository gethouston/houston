import type { Routine } from "@houston/protocol";
import {
  ASSISTANT_USER_ID_ENV,
  MANAGED_CLOUD_ENV,
} from "../launcher/assistant-role";

type Env = Record<string, string | undefined>;

export function managerOwner(env: Env = process.env): string | undefined {
  if (env[MANAGED_CLOUD_ENV] !== "1") return undefined;
  return env[ASSISTANT_USER_ID_ENV]?.trim() || undefined;
}

export function managedOwnerSub(env: Env = process.env): string | undefined {
  return managerOwner(env) ?? (env.HOUSTON_USER_ID || undefined);
}

export function actingMayRunRoutine(
  actingSub: string | null | undefined,
  routine: Pick<Routine, "created_by">,
  env: Env = process.env,
): boolean {
  if (!actingSub) return false;
  if (routine.created_by && actingSub === routine.created_by) return true;
  return actingSub === managerOwner(env);
}
