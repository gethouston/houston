import {
  type Activity,
  type InteractionStep,
  isSuggestionStep,
  type Routine,
  type RoutineRun,
} from "@houston/protocol";

/**
 * The deterministic look across the person's agents that runs BEFORE any model
 * call. An empty snapshot means the briefing records "quiet" and costs
 * nothing; a non-empty one is the material the prompt hands the manager.
 * Pure: the host loads each agent's board, routines and runs, this decides.
 */

/** Each section keeps this many items; the rest is a count. */
export const HEARTBEAT_SECTION_CAP = 20;

/** One agent's documents, as the host loaded them. */
export interface HeartbeatAgentData {
  agentName: string;
  activities: readonly Activity[];
  routines: readonly Routine[];
  runs: readonly RoutineRun[];
}

export interface HeartbeatSection<T> {
  items: T[];
  /** How many more matched than the cap kept. */
  more: number;
}

export interface HeartbeatNeedsYou {
  agent: string;
  title: string;
  /** What the mission waits on (a question, a sign-in...), when it says. */
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
}

function capped<T>(items: T[]): HeartbeatSection<T> {
  return {
    items: items.slice(0, HEARTBEAT_SECTION_CAP),
    more: Math.max(0, items.length - HEARTBEAT_SECTION_CAP),
  };
}

const newestFirst =
  <T>(at: (item: T) => string) =>
  (a: T, b: T) =>
    at(b).localeCompare(at(a));

/** The first step the mission is genuinely blocked on (offers never block). */
function blockingKind(activity: Activity): InteractionStep["kind"] | undefined {
  return activity.pending_interaction?.steps.find(
    (step) => !isSuggestionStep(step),
  )?.kind;
}

const atOrAfter = (iso: string | undefined, sinceMs: number) =>
  iso !== undefined && Date.parse(iso) >= sinceMs;

/**
 * Everything worth a morning sentence since `sinceMs` (the last briefing, or a
 * day ago): missions waiting on the person, routine runs that failed or
 * reported something, routines the engine paused by itself, and missions
 * finished. A surfaced run whose card is already waiting on the person is
 * named once, as the card.
 */
export function buildHeartbeatSnapshot(
  agents: readonly HeartbeatAgentData[],
  sinceMs: number,
): HeartbeatSnapshot {
  const needsYou: (HeartbeatNeedsYou & { at: string })[] = [];
  const runs: HeartbeatRoutineRun[] = [];
  const paused: HeartbeatPausedRoutine[] = [];
  const done: (HeartbeatDone & { at: string })[] = [];
  for (const data of agents) {
    const agent = data.agentName;
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
          at,
        });
      } else if (activity.status === "done" && atOrAfter(at, sinceMs)) {
        done.push({ agent, title: activity.title, at });
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
        at,
      });
    }
    for (const routine of data.routines) {
      if (routine.enabled || !routine.auto_paused) continue;
      paused.push({
        agent,
        routine: routine.name,
        failures: routine.auto_paused.failures,
      });
    }
  }
  const byAt = newestFirst<{ at: string }>((item) => item.at);
  const strip = <T extends { at: string }>({ at: _at, ...rest }: T) => rest;
  return {
    needsYou: capped(needsYou.sort(byAt).map(strip)),
    routineRuns: capped(runs.sort(byAt)),
    pausedRoutines: capped(paused),
    done: capped(done.sort(byAt).map(strip)),
  };
}

/** Nothing in any section: no model call, no message, no notification. */
export function isHeartbeatSnapshotEmpty(snapshot: HeartbeatSnapshot): boolean {
  return (
    snapshot.needsYou.items.length === 0 &&
    snapshot.routineRuns.items.length === 0 &&
    snapshot.pausedRoutines.items.length === 0 &&
    snapshot.done.items.length === 0
  );
}
