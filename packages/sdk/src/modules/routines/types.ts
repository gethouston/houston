/**
 * Wire types for an agent's ROUTINES — the work it repeats on a schedule and
 * the record of the times it ran — plus the command vocabulary the bridge
 * dispatches them by.
 *
 * The routine shapes themselves belong to `@houston/protocol`, which owns the
 * on-disk `.houston` schema every host reads and writes; re-exporting them here
 * keeps ONE definition behind the SDK, the host and the desktop client. Only
 * {@link WebhookKeyReveal} is local: the gateway mints it and it never lands in
 * routine data, so the on-disk schema has no shape for it.
 */

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

/** The write vocabulary — the same constants back the facade and the bridge. */
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

/** The raw value of `key` off an untrusted command payload. */

/**
 * A new routine off an untrusted payload, shape-checked down to the two fields
 * the host requires of every routine. The wake mechanism is NOT checked here:
 * `schedule` and `trigger` are mutually exclusive and the host is the one that
 * enforces that, so a client-side guess would refuse bindings a newer gateway
 * accepts.
 */
export function requireNewRoutine(payload: unknown): NewRoutine {
  const value = field(payload, "input");
  if (typeof value !== "object" || value === null)
    throw new Error("missing 'input'");
  const input = value as Partial<NewRoutine>;
  if (typeof input.name !== "string" || typeof input.prompt !== "string")
    throw new Error("'input' needs a 'name' and a 'prompt'");
  return input as NewRoutine;
}

/**
 * A routine edit off an untrusted payload. Every field is optional by design —
 * an update carries only what changes — so the only thing to check is that the
 * caller sent an object at all.
 */
export function requireRoutineUpdate(payload: unknown): RoutineUpdate {
  const value = field(payload, "updates");
  if (typeof value !== "object" || value === null)
    throw new Error("missing 'updates'");
  return value as RoutineUpdate;
}
