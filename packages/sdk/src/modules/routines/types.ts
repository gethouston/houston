import type {
  NewRoutine,
  Routine,
  RoutineRun,
  RoutineUpdate,
} from "@houston/protocol";
import { field } from "../payload";

export type { NewRoutine, Routine, RoutineRun, RoutineUpdate };

export interface WebhookKeyReveal {
  url: string;
  secret: string;
  key_prefix: string;
}

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
