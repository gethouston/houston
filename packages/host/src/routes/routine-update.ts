import {
  applyRoutineUpdate,
  isValidTriggerBinding,
  loadRoutines,
  saveRoutines,
  upsertById,
} from "@houston/domain";
import type { Routine, RoutineUpdate } from "@houston/protocol";
import type { Vfs } from "../vfs";
import { withDocLock } from "./doc-lock";
import { checkedRoutineModel } from "./routine-model";
import { checkedSchedule } from "./routine-schedule";
import type { RoutineWriteError, RoutineWriteOptions } from "./routine-write";
import {
  NO_TRIGGER_BACKEND_WRITE_ERROR,
  planFloorRefusal,
  providerPinError,
  wakeMechanismError,
} from "./routine-write-gates";

export async function updateRoutineChecked(
  vfs: Vfs,
  root: string,
  workspaceId: string,
  itemId: string,
  update: Record<string, unknown>,
  opts: RoutineWriteOptions & { actorSub?: string },
): Promise<{ routine: Routine } | RoutineWriteError | { notFound: true }> {
  return await withDocLock(`${root}#routines`, async () => {
    const { items } = await loadRoutines(vfs, root);
    const current = items.find((r) => r.id === itemId);
    if (!current) return { notFound: true };
    if (update.trigger != null && !isValidTriggerBinding(update.trigger)) {
      return { error: "invalid 'trigger' binding" };
    }
    let next = applyRoutineUpdate(
      current,
      update as RoutineUpdate,
      opts.nowIso,
      opts.actorSub,
    );
    const nextWakeErr = wakeMechanismError(
      next as unknown as Record<string, unknown>,
    );
    if (nextWakeErr) return { error: nextWakeErr };
    if (
      (next as { trigger?: unknown }).trigger != null &&
      !opts.triggersEnabled
    ) {
      return { error: NO_TRIGGER_BACKEND_WRITE_ERROR };
    }
    if (typeof next.schedule === "string") {
      const checked = await checkedSchedule(
        vfs,
        workspaceId,
        next.schedule,
        opts.timezone,
      );
      if ("error" in checked) return checked;
      next = { ...next, schedule: checked.schedule };
    }
    if (next.enabled !== false) {
      const refusal = planFloorRefusal(
        next.schedule,
        opts.minIntervalMinutes,
        current.schedule === next.schedule,
      );
      if (refusal) return refusal;
    }
    const providerErr = providerPinError(update);
    if (providerErr) return { error: providerErr };
    if (update.model != null) {
      const checked = await checkedRoutineModel(vfs, root, next);
      if ("error" in checked) return checked;
      next = { ...next, model: checked.model };
    }

    await saveRoutines(vfs, root, upsertById(items, next));
    return { routine: next };
  });
}
