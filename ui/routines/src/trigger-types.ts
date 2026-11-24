import type { RoutineTriggerBinding } from "./types";
/**
 * How a routine wakes: on a cron `schedule`, or when an external `event`
 * happens (a Composio trigger). The routine editor's segmented choice toggles
 * between the two; exactly one is active per routine.
 */
export type RoutineWakeMode = "schedule" | "event";

/** The wake mechanism the editor commits on save (discriminated on `mode`). */
export type RoutineWake =
  | { mode: "schedule"; schedule: string }
  | { mode: "event"; trigger: RoutineTriggerBinding };

/**
 * A trigger routine's live provisioning status. `active` = delivering;
 * `pending` = reconcile in flight; `paused_disconnected` = the connected account
 * was disconnected (offer Reconnect); `paused_revoked` = the toolkit fell outside
 * the agent's access; `error` = Composio rejected creation or delivery is failing.
 */
export type TriggerStatusState =
  | "active"
  | "pending"
  | "paused_disconnected"
  | "paused_revoked"
  | "error";

export interface TriggerStatusItem {
  routine_id: string;
  status: TriggerStatusState;
  detail?: string;
}

/** A connectable account for a toolkit, offered when the user has more than one. */
export interface TriggerAppAccount {
  id: string;
  label: string;
}

/** An app the agent can build an event trigger on (connected + allowed). */
export interface TriggerApp {
  toolkit: string;
  name: string;
  logoUrl?: string;
  /** Active connected accounts for this toolkit; a select shows when >1. */
  accounts: TriggerAppAccount[];
}

/** A composed "create/update a routine" input: a name, a prompt, and the wake
 *  mechanism the app-owned stepper collected (a cron schedule or an event). */
export interface RoutineEditPatch {
  name: string;
  prompt: string;
  wake: RoutineWake;
}
