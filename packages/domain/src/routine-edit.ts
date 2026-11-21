import type { NewRoutine, Routine, RoutineUpdate } from "@houston/protocol";

export function createRoutine(
  input: NewRoutine,
  id: string,
  nowIso: string,
  createdBy?: string,
): Routine {
  return {
    id,
    name: input.name,
    prompt: input.prompt,
    enabled: input.enabled ?? true,
    suppress_when_silent: input.suppress_when_silent ?? false,
    chat_mode: input.chat_mode ?? "shared",
    provider: input.provider ?? null,
    model: input.model ?? null,
    effort: input.effort ?? null,
    integrations: input.integrations ?? [],
    created_at: nowIso,
    updated_at: nowIso,
    ...(input.schedule ? { schedule: input.schedule } : {}),
    ...(input.trigger ? { trigger: input.trigger } : {}),
    ...(input.setup_activity_id
      ? { setup_activity_id: input.setup_activity_id }
      : {}),
    ...(createdBy ? { created_by: createdBy } : {}),
  };
}

export function applyRoutineUpdate(
  current: Routine,
  update: RoutineUpdate,
  nowIso: string,
  actorSub?: string,
): Routine {
  const defined = Object.fromEntries(
    Object.entries(update).filter(
      ([k, v]) =>
        v !== undefined &&
        k !== "timezone" &&
        k !== "created_by" &&
        k !== "auto_paused" &&
        k !== "snoozed",
    ),
  );
  const clearsTrigger = defined.trigger === null;
  const clearsSchedule = defined.schedule === null;
  if (clearsTrigger) delete defined.trigger;
  if (clearsSchedule) delete defined.schedule;
  const next = {
    ...current,
    ...defined,
    ...(actorSub ? { created_by: actorSub } : {}),
    updated_at: nowIso,
  } as Routine;
  if (defined.schedule !== undefined) delete next.trigger;
  if (defined.trigger !== undefined) delete next.schedule;
  if (clearsTrigger) delete next.trigger;
  if (clearsSchedule) delete next.schedule;
  if (defined.enabled === true) delete next.auto_paused;
  if (
    defined.enabled === true ||
    defined.model !== undefined ||
    defined.provider !== undefined
  )
    delete next.snoozed;
  return next;
}
