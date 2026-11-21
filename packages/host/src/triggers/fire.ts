import { loadRoutines } from "@houston/domain";
import type { Routine } from "@houston/protocol";
import type { Agent, Workspace, WorkspaceRuntime } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { RuntimeChannel } from "../ports";
import { fireRoutineRun, RoutineBusyError } from "../schedule/run";
import { isUnconnectedRefusal } from "../schedule/run-failure";
import type { Vfs } from "../vfs";
import { assertActingIsCreator } from "./acting";
import { TriggerRoutineFirer } from "./trigger-firer";

export interface TriggerEvent {
  id: string;
  routine_id: string;
  trigger_slug: string;
  payload: unknown;
}

export type FireTriggerResult =
  | { result: "fired"; event_ids: string[] }
  | { result: "busy" }
  | { result: "no_routine" };

export interface TriggerEventLock {
  setNx(key: string, value: string, ttlSec: number): Promise<boolean>;
  del(key: string): Promise<void>;
}

export interface FireTriggerDeps {
  vfs: Vfs;
  paths: WorkspacePaths;
  channels: Partial<Record<WorkspaceRuntime, RuntimeChannel>>;
  events?: EventHub;
  lock: TriggerEventLock;
  dedupTtlSec?: number;
  actingAs?: string;
  now?: () => Date;
  newId?: () => string;
}

const lockKey = (eventId: string) => `trigger-event:${eventId}`;

export async function fireTriggerEvents(
  deps: FireTriggerDeps,
  ws: Workspace,
  agent: Agent,
  events: TriggerEvent[],
): Promise<FireTriggerResult> {
  const ttl = deps.dedupTtlSec ?? 3600;
  const root = deps.paths.agentRoot(ws, agent);
  const { items: routines } = await loadRoutines(deps.vfs, root);
  const enabled = new Map<string, Routine>(
    routines.filter((r) => r.enabled && r.trigger).map((r) => [r.id, r]),
  );

  const byRoutine = new Map<string, TriggerEvent[]>();
  for (const e of events) {
    if (!enabled.has(e.routine_id)) continue;
    const group = byRoutine.get(e.routine_id);
    if (group) group.push(e);
    else byRoutine.set(e.routine_id, [e]);
  }
  if (byRoutine.size === 0) return { result: "no_routine" };

  const consumed: string[] = [];
  for (const [routineId, group] of byRoutine) {
    const routine = enabled.get(routineId) as Routine;
    if (deps.actingAs) assertActingIsCreator(deps.actingAs, routine);
    const fresh: TriggerEvent[] = [];
    for (const e of group) {
      if (await deps.lock.setNx(lockKey(e.id), "1", ttl)) fresh.push(e);
    }
    if (fresh.length === 0) {
      for (const e of group) consumed.push(e.id);
      continue;
    }
    const firer = new TriggerRoutineFirer(deps.channels, fresh, deps.actingAs);
    try {
      await fireRoutineRun(
        {
          vfs: deps.vfs,
          paths: deps.paths,
          firer,
          events: deps.events,
          now: deps.now ?? (() => new Date()),
          newId: deps.newId ?? (() => crypto.randomUUID()),
        },
        ws,
        agent,
        routine,
      );
      for (const e of group) consumed.push(e.id);
    } catch (err) {
      if (isUnconnectedRefusal(err)) {
        for (const e of group) consumed.push(e.id);
        continue;
      }
      for (const e of fresh) await deps.lock.del(lockKey(e.id));
      if (err instanceof RoutineBusyError) return { result: "busy" };
      throw err;
    }
  }
  return { result: "fired", event_ids: consumed };
}
