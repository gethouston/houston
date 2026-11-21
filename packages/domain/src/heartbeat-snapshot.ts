import {
  type Activity,
  type InteractionStep,
  isSuggestionStep,
  type Routine,
  type RoutineRun,
} from "@houston/protocol";
import {
  type HeartbeatItemKind,
  type HeartbeatSection,
  heartbeatItemKey,
  type Keyed,
  orderSection,
} from "./heartbeat-sections";

export interface HeartbeatAgentData {
  agentId: string;
  agentName: string;
  activities: readonly Activity[];
  routines: readonly Routine[];
  runs: readonly RoutineRun[];
}

export interface HeartbeatNeedsYou {
  agent: string;
  title: string;
  waitingOn?: InteractionStep["kind"];
}

export interface HeartbeatRoutineRun {
  agent: string;
  routine: string;
  status: "error" | "surfaced";
  summary?: string;
  at: string;
}

export interface HeartbeatPausedRoutine {
  agent: string;
  routine: string;
  failures: number;
}

export interface HeartbeatDone {
  agent: string;
  title: string;
}

export interface HeartbeatSnapshot {
  needsYou: HeartbeatSection<HeartbeatNeedsYou>;
  routineRuns: HeartbeatSection<HeartbeatRoutineRun>;
  pausedRoutines: HeartbeatSection<HeartbeatPausedRoutine>;
  done: HeartbeatSection<HeartbeatDone>;
  unseen: number;
  namedKeys: string[];
  presentKeys: string[];
  unreadAgents: string[];
}

function blockingKind(activity: Activity): InteractionStep["kind"] | undefined {
  return activity.pending_interaction?.steps.find(
    (step) => !isSuggestionStep(step),
  )?.kind;
}

const atOrAfter = (iso: string | undefined, sinceMs: number) =>
  iso !== undefined && Date.parse(iso) >= sinceMs;

export function buildHeartbeatSnapshot(
  agents: readonly HeartbeatAgentData[],
  sinceMs: number,
  seen: ReadonlySet<string> = new Set(),
  unreadAgents: readonly string[] = [],
): HeartbeatSnapshot {
  const needsYou: (HeartbeatNeedsYou & Keyed)[] = [];
  const runs: (HeartbeatRoutineRun & Keyed)[] = [];
  const paused: (HeartbeatPausedRoutine & Keyed)[] = [];
  const done: (HeartbeatDone & Keyed)[] = [];
  for (const data of agents) {
    const agent = data.agentName;
    const key = (kind: HeartbeatItemKind, rest: string) =>
      heartbeatItemKey(kind, data.agentId, rest);
    const waiting = new Set<string>();
    for (const activity of data.activities) {
      const at = activity.updated_at ?? "";
      if (activity.status === "needs_you") {
        waiting.add(activity.id);
        const waitingOn = blockingKind(activity);
        needsYou.push({
          agent,
          title: activity.title,
          ...(waitingOn ? { waitingOn } : {}),
          key: key("need", activity.id),
          at,
        });
      } else if (activity.status === "done" && atOrAfter(at, sinceMs)) {
        done.push({
          agent,
          title: activity.title,
          key: key("done", activity.id),
          at,
        });
      }
    }
    const routineName = new Map(data.routines.map((r) => [r.id, r.name]));
    for (const run of data.runs) {
      if (run.status !== "error" && run.status !== "surfaced") continue;
      const at = run.completed_at ?? run.started_at;
      if (!atOrAfter(at, sinceMs)) continue;
      if (run.activity_id && waiting.has(run.activity_id)) continue;
      runs.push({
        agent,
        routine: routineName.get(run.routine_id) ?? run.routine_id,
        status: run.status,
        ...(run.summary ? { summary: run.summary } : {}),
        key: key("run", run.id),
        at,
      });
    }
    for (const routine of data.routines) {
      if (routine.enabled || !routine.auto_paused) continue;
      const at = routine.auto_paused.at;
      paused.push({
        agent,
        routine: routine.name,
        failures: routine.auto_paused.failures,
        key: key("pause", `${routine.id}:${at}`),
        at,
      });
    }
  }
  const ordered = {
    needsYou: orderSection(needsYou, seen),
    routineRuns: orderSection(runs, seen),
    pausedRoutines: orderSection(paused, seen),
    done: orderSection(done, seen),
  };
  const all = Object.values(ordered);
  const bare = <T extends Keyed>(
    section: HeartbeatSection<T>,
  ): HeartbeatSection<Omit<T, keyof Keyed>> => ({
    items: section.items.map(({ key: _key, at: _at, ...rest }) => rest),
    more: section.more,
  });
  return {
    needsYou: bare(ordered.needsYou.section),
    routineRuns: {
      items: ordered.routineRuns.section.items.map(
        ({ key: _key, ...run }) => run,
      ),
      more: ordered.routineRuns.section.more,
    },
    pausedRoutines: bare(ordered.pausedRoutines.section),
    done: bare(ordered.done.section),
    unseen: all.reduce((n, s) => n + s.unseen, 0),
    namedKeys: all.flatMap((s) => s.named),
    presentKeys: all.flatMap((s) => s.present),
    unreadAgents: [...unreadAgents],
  };
}

export function isHeartbeatSnapshotEmpty(snapshot: HeartbeatSnapshot): boolean {
  return (
    snapshot.needsYou.items.length === 0 &&
    snapshot.routineRuns.items.length === 0 &&
    snapshot.pausedRoutines.items.length === 0 &&
    snapshot.done.items.length === 0
  );
}
