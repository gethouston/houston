import type {
  NewRoutine,
  Routine,
  RoutineRun,
  RoutineUpdate,
} from "@houston/protocol";
import { field } from "../payload";

export type { NewRoutine, Routine, RoutineRun, RoutineUpdate };

/**
 * The one-time reveal from minting (or rotating) a routine's incoming-webhook
 * key. `url` is the public ingress the outside system POSTs to; `secret` is
 * shown to the user EXACTLY once and is never stored in routine data;
 * `key_prefix` is the display-only "wh_xxxxxxxx" label the UI persists onto the
 * routine's webhook binding. Calling again rotates: the old secret dies.
 */
export interface WebhookKeyReveal {
  url: string;
  secret: string;
  key_prefix: string;
}

/** The write vocabulary — the same constants back the facade and `dispatch`. */
export const RoutinesCommand = {
  List: "routines/list",
  ListRuns: "routines/listRuns",
  Create: "routines/create",
  Update: "routines/update",
  Delete: "routines/delete",
  RunNow: "routines/runNow",
  CancelRun: "routines/cancelRun",
  MintWebhookKey: "routines/mintWebhookKey",
} as const;

export type RoutinesCommandType =
  (typeof RoutinesCommand)[keyof typeof RoutinesCommand];

export function requireNewRoutine(payload: unknown): NewRoutine {
  const value = field(payload, "input");
  if (typeof value !== "object" || value === null)
    throw new Error("missing 'input'");
  const input = value as Partial<NewRoutine>;
  if (typeof input.name !== "string" || typeof input.prompt !== "string")
    throw new Error("'input' needs a 'name' and a 'prompt'");
  return input as NewRoutine;
}

export function requireRoutineUpdate(payload: unknown): RoutineUpdate {
  const value = field(payload, "updates");
  if (typeof value !== "object" || value === null)
    throw new Error("missing 'updates'");
  return value as RoutineUpdate;
}
