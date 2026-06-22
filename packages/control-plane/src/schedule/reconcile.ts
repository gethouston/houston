import type { ChatMessage } from "@houston/protocol";
import {
  completeRoutineRun,
  loadActivities,
  loadRoutineRuns,
  loadRoutines,
  routineActivity,
  saveActivities,
  saveRoutineRuns,
  upsertById,
} from "@houston/domain";
import type { Agent, Workspace } from "../domain/types";
import type { Vfs } from "../vfs";
import type { EventHub } from "../events/hub";
import { conversationKey, type WorkspacePaths } from "../paths";

/** A run still 'running' after this long with no agent reply is declared timed-out. */
const RUN_TIMEOUT_MS = 15 * 60 * 1000;

interface StoredConversation {
  messages: ChatMessage[];
}

/** The agent's reply for this run: the last assistant message after the run started. */
function replyAfter(
  conversation: StoredConversation | null,
  startedAtMs: number,
): string | null {
  if (!conversation) return null;
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const m = conversation.messages[i];
    if (!m) continue;
    if (m.role === "assistant" && m.ts >= startedAtMs) return m.content;
  }
  return null;
}

export interface ReconcileDeps {
  vfs: Vfs;
  paths: WorkspacePaths;
  /** Atomic guard so two replicas don't double-surface the same run. */
  lock: { setNx(key: string, value: string, ttlSec: number): Promise<boolean> };
  events?: EventHub;
  now: () => Date;
  newId: () => string;
}

/**
 * Complete an agent's 'running' routine runs by reading each run's conversation:
 * the agent's reply classifies the run silent vs surfaced (per runner.rs), a
 * surfaced run gets a board Activity, and a run with no reply past the timeout
 * is marked errored (never stuck 'running'). Idempotent + multi-replica safe:
 * a per-run setNx lock arbitrates, and a terminal run is never revisited.
 */
export async function reconcileAgentRuns(
  deps: ReconcileDeps,
  ws: Workspace,
  agent: Agent,
): Promise<void> {
  const root = deps.paths.agentRoot(ws, agent);
  const { items: runs } = await loadRoutineRuns(deps.vfs, root);
  const running = runs.filter((r) => r.status === "running");
  if (running.length === 0) return;

  const { items: routines } = await loadRoutines(deps.vfs, root);
  const nowMs = deps.now().getTime();
  let changed = false;
  let activitiesTouched = false;
  let nextRuns = runs;

  for (const run of running) {
    const routine = routines.find((r) => r.id === run.routine_id);
    if (!routine) continue; // routine deleted; leave the run to the next sweep

    const raw = await deps.vfs.readText(
      conversationKey(deps.paths, ws, agent, run.session_key),
    );
    const conversation = raw ? (JSON.parse(raw) as StoredConversation) : null;
    const reply = replyAfter(conversation, Date.parse(run.started_at));

    const timedOut =
      !reply && nowMs - Date.parse(run.started_at) > RUN_TIMEOUT_MS;
    if (!reply && !timedOut) continue; // turn still in flight

    // One replica owns this run's completion.
    if (!(await deps.lock.setNx(`routine:reconcile:${run.id}`, "1", 120)))
      continue;

    if (timedOut) {
      nextRuns = upsertById(nextRuns, {
        ...run,
        status: "error",
        summary: "The routine timed out without a response.",
        completed_at: deps.now().toISOString(),
      });
      changed = true;
      continue;
    }

    if (!reply) continue; // narrowing: timedOut is false here, so reply must be set
    const done = completeRoutineRun(
      run,
      routine,
      reply,
      deps.now().toISOString(),
    );
    if (done.status === "surfaced") {
      const { items: activities } = await loadActivities(deps.vfs, root);
      const existing = activities.find(
        (a) => a.session_key === run.session_key,
      );
      const activity = routineActivity(
        routine,
        done,
        existing,
        deps.newId(),
        deps.now().toISOString(),
      );
      await saveActivities(deps.vfs, root, upsertById(activities, activity));
      done.activity_id = activity.id;
      activitiesTouched = true;
    }
    nextRuns = upsertById(nextRuns, done);
    changed = true;
  }

  if (changed) {
    await saveRoutineRuns(deps.vfs, root, nextRuns);
    deps.events?.emit(ws.ownerUserId, {
      type: "RoutineRunsChanged",
      agentPath: agent.id,
    });
  }
  if (activitiesTouched) {
    deps.events?.emit(ws.ownerUserId, {
      type: "ActivityChanged",
      agentPath: agent.id,
    });
  }
}
