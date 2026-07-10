/**
 * useRoutineEditFields — the routine editor's field state, split out of
 * `RoutineRowEdit` so that component stays under the size cap.
 *
 * It owns name / instruction / schedule / trigger, mirrored against a `baseline`
 * of the last adopted `initial`: while the user has no local edits the fields
 * track external changes to `initial` (an agent editing routines.json); local
 * edits win until the parent saves or cancels (which unmounts this state).
 */
import { useState } from "react";
import type { RoutineTriggerBinding } from "./types";

const DEFAULT_SCHEDULE = "0 9 * * *";

export interface RoutineEditInitial {
  name: string;
  prompt: string;
  schedule?: string;
  trigger?: RoutineTriggerBinding | null;
}

interface Snapshot {
  name: string;
  prompt: string;
  schedule: string;
  triggerJson: string;
}

function snapshotOf(v: RoutineEditInitial): Snapshot {
  return {
    name: v.name,
    prompt: v.prompt,
    schedule: v.schedule ?? DEFAULT_SCHEDULE,
    triggerJson: v.trigger ? JSON.stringify(v.trigger) : "",
  };
}

export function useRoutineEditFields(initial: RoutineEditInitial) {
  const seed = snapshotOf(initial);
  const [name, setName] = useState(seed.name);
  const [prompt, setPrompt] = useState(seed.prompt);
  const [schedule, setSchedule] = useState(seed.schedule);
  const [trigger, setTrigger] = useState<RoutineTriggerBinding | null>(
    initial.trigger ?? null,
  );
  // An existing binding is assumed valid; a fresh event routine starts invalid.
  const [triggerValid, setTriggerValid] = useState(!!initial.trigger);
  const [baseline, setBaseline] = useState<Snapshot>(seed);

  const current: Snapshot = {
    name,
    prompt,
    schedule,
    triggerJson: trigger ? JSON.stringify(trigger) : "",
  };
  const isDirty =
    current.name !== baseline.name ||
    current.prompt !== baseline.prompt ||
    current.schedule !== baseline.schedule ||
    current.triggerJson !== baseline.triggerJson;

  // Adopt external edits to `initial` when the user hasn't touched the fields
  // (render-phase adjust, same shape as routines-tab's trackedAgentId).
  const incoming = snapshotOf(initial);
  if (
    !isDirty &&
    (incoming.name !== baseline.name ||
      incoming.prompt !== baseline.prompt ||
      incoming.schedule !== baseline.schedule ||
      incoming.triggerJson !== baseline.triggerJson)
  ) {
    setBaseline(incoming);
    setName(incoming.name);
    setPrompt(incoming.prompt);
    setSchedule(incoming.schedule);
    setTrigger(initial.trigger ?? null);
    setTriggerValid(!!initial.trigger);
  }

  return {
    name,
    setName,
    prompt,
    setPrompt,
    schedule,
    setSchedule,
    trigger,
    setTrigger,
    triggerValid,
    setTriggerValid,
    isDirty,
  };
}
