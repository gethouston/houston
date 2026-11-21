import type { RoutineTriggerBinding } from "./types";
export type RoutineWakeMode = "schedule" | "event";

export type RoutineWake =
  | { mode: "schedule"; schedule: string }
  | { mode: "event"; trigger: RoutineTriggerBinding };

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

export interface TriggerAppAccount {
  id: string;
  label: string;
}

export interface TriggerApp {
  toolkit: string;
  name: string;
  logoUrl?: string;
  accounts: TriggerAppAccount[];
}

export interface RoutineEditPatch {
  name: string;
  prompt: string;
  wake: RoutineWake;
}
