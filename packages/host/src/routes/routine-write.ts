import {
  createRoutine,
  loadRoutines,
  saveRoutines,
  upsertById,
} from "@houston/domain";
import type {
  NewRoutine,
  PlanMinIntervalRefusal,
  Routine,
} from "@houston/protocol";
import type { Vfs } from "../vfs";
import { withDocLock } from "./doc-lock";
import type { LiveTurnPin } from "./live-turn-pin";
import { routineCreationPin } from "./routine-creation-pin";
import { checkedRoutineModel } from "./routine-model";
import { checkedSchedule } from "./routine-schedule";
import {
  NO_TRIGGER_BACKEND_WRITE_ERROR,
  planFloorRefusal,
  providerPinError,
  wakeMechanismError,
} from "./routine-write-gates";

export { updateRoutineChecked } from "./routine-update";

export interface RoutineWriteOptions {
  triggersEnabled: boolean;
  nowIso: string;
  id?: string;
  minIntervalMinutes?: number;
  timezone?: string;
}

export type RoutineWriteError = { error: string } | PlanMinIntervalRefusal;

// WHY: Merge-safe write: each setup chat knows only its own routine and must not delete the others. ADR-0016
export async function createRoutineChecked(
  vfs: Vfs,
  root: string,
  workspaceId: string,
  body: Record<string, unknown>,
  opts: RoutineWriteOptions & {
    createdBy?: string;
    authoringPin?: LiveTurnPin;
  },
): Promise<{ routine: Routine } | RoutineWriteError> {
  for (const field of ["name", "prompt"]) {
    if (!body[field] || typeof body[field] !== "string") {
      return { error: `missing '${field}'` };
    }
  }
  const wakeErr = wakeMechanismError(body);
  if (wakeErr) return { error: wakeErr };
  if (body.trigger != null && !opts.triggersEnabled) {
    return { error: NO_TRIGGER_BACKEND_WRITE_ERROR };
  }
  let input = routineCreationPin(
    body as unknown as NewRoutine,
    opts.authoringPin,
  );
  if (typeof input.schedule === "string") {
    const checked = await checkedSchedule(
      vfs,
      workspaceId,
      input.schedule,
      opts.timezone,
    );
    if ("error" in checked) return checked;
    input = { ...input, schedule: checked.schedule };
  }
  if (input.enabled !== false) {
    const refusal = planFloorRefusal(input.schedule, opts.minIntervalMinutes);
    if (refusal) return refusal;
  }
  const providerErr = providerPinError({ provider: input.provider });
  if (providerErr) return { error: providerErr };
  if (body.model != null) {
    const checked = await checkedRoutineModel(vfs, root, input);
    if ("error" in checked) return checked;
    input = { ...input, model: checked.model };
  }

  return await withDocLock(`${root}#routines`, async () => {
    const { items } = await loadRoutines(vfs, root);
    const routine = createRoutine(
      input,
      opts.id ?? crypto.randomUUID(),
      opts.nowIso,
      opts.createdBy,
    );
    await saveRoutines(vfs, root, upsertById(items, routine));
    return { routine };
  });
}
