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

/**
 * The merge-safe routine write path, shared by the authenticated agent-data
 * route (routes/agent-data.ts) and the runtime `save_routine` tool's sandbox
 * route (routes/routines-sandbox.ts). BOTH mutate the SAME routines.json through
 * a read-modify-write (loadRoutines -> create/apply -> upsertById -> saveRoutines)
 * so a second write never clobbers a routine a first one persisted. The runtime
 * must NEVER wholesale-replace the file (the isolated-setup-chat bug that deleted
 * task #1 when task #2 was created); this is the one blessed write path.
 */
export { updateRoutineChecked } from "./routine-update";

/** Common gate options for both write paths. */
export interface RoutineWriteOptions {
  /** Whether this deployment can fire event-driven routines (Houston Cloud). */
  triggersEnabled: boolean;
  /** ISO clock the caller supplies (domain stays pure). */
  nowIso: string;
  /** Stable id supplied when an optimistic write may be retried. */
  id?: string;
  /**
   * The fewest minutes between fires the writer's plan allows, as the gateway
   * stamped it: the turn's `limits` for an agent's save, the
   * `x-houston-routine-floor` header for an app or AI Manager write. Absent =
   * no floor (Plus, the desktop, self-host).
   */
  minIntervalMinutes?: number;
  /** A pooled turn carries the planner zone instead of workspace preferences. */
  timezone?: string;
}

/** A refused write: the reason the caller relays, plus a code when it has one. */
export type RoutineWriteError = { error: string } | PlanMinIntervalRefusal;

/**
 * Create a routine merge-safely. Runs the SAME create-time gates as the
 * authenticated POST (name/prompt present, exactly one wake, trigger-backend
 * availability, valid schedule, plan floor when one is set, known provider
 * pin), then reads the existing file, appends the new routine, and writes the
 * whole survivor set back. Returns the created routine or a plain-language error
 * the caller relays.
 */
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
  // Exactly one wake mechanism (a cron schedule OR an event trigger).
  const wakeErr = wakeMechanismError(body);
  if (wakeErr) return { error: wakeErr };
  // No trigger backend here -> a trigger-bound routine could never wake.
  if (body.trigger != null && !opts.triggersEnabled) {
    return { error: NO_TRIGGER_BACKEND_WRITE_ERROR };
  }
  let input = routineCreationPin(
    body as unknown as NewRoutine,
    opts.authoringPin,
  );
  // Trigger routines have no schedule to check.
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
  // A routine created disabled never fires, so it is exempt (as on update).
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
