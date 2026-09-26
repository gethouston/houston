import type { PlanRoutineKey } from "@houston/wire-types";
import { requireString } from "../payload";

export const PlanCommand = {
  Get: "plan/get",
  Checkout: "plan/checkout",
  Portal: "plan/portal",
  ListInvoices: "plan/listInvoices",
  ListRoutines: "plan/listRoutines",
  KeepRoutine: "plan/keepRoutine",
  ResumeRoutines: "plan/resumeRoutines",
  Presence: "plan/presence",
  DismissAnnouncement: "plan/dismissAnnouncement",
} as const;

export function requireRoutineKey(payload: unknown): PlanRoutineKey {
  return {
    orgSlug: requireString(payload, "orgSlug"),
    agentSlug: requireString(payload, "agentSlug"),
    routineId: requireString(payload, "routineId"),
  };
}
