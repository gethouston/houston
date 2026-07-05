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
import type {
  ChatMessage,
  ProviderError,
  Routine,
  RoutineRun,
} from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import { conversationKey, type WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { withRunsFile } from "./runs-lock";

/** A run still 'running' after this long with no agent reply is declared timed-out. */
const RUN_TIMEOUT_MS = 15 * 60 * 1000;

interface StoredConversation {
  messages: ChatMessage[];
}

/**
 * The agent's reply for this run: the last assistant message after the run
 * started. Returns the MESSAGE (not just its text) so the caller can read a
 * persisted providerError — a failed turn appends an empty-content assistant
 * message carrying the typed failure, and that emptiness must classify as
 * "the turn answered (badly)", never "still in flight".
 */
function replyAfter(
  conversation: StoredConversation | null,
  startedAtMs: number,
): ChatMessage | null {
  if (!conversation) return null;
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const m = conversation.messages[i];
    if (!m) continue;
    if (m.role === "assistant" && m.ts >= startedAtMs) return m;
  }
  return null;
}

/** A run-row-sized reason from the turn's typed provider failure. */
function providerErrorSummary(err: ProviderError): string {
  const text = err.kind === "unknown" ? err.raw_excerpt : err.message;
  return text.trim() || `provider error (${err.kind})`;
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

/** One sweep's decision for a run, applied only if the row is still `running`. */
interface RunUpdate {
  run: RoutineRun;
  /** Set when the update surfaces content — drives the board Activity. */
  surfacedRoutine?: Routine;
}

/**
 * Complete an agent's 'running' routine runs by reading each run's conversation:
 * the agent's reply classifies the run silent vs surfaced (per runner.rs), a
 * surfaced run gets a board Activity, and a run with no reply past the timeout
 * is marked errored (never stuck 'running'). Idempotent + multi-replica safe:
 * a per-run setNx lock arbitrates, and a terminal run is never revisited.
 *
 * The runs file is RE-READ just before saving and an update lands only when its
 * row is still `running` in the fresh copy: a user cancel that raced this sweep
 * flipped the row terminal first (schedule/cancel.ts), and a stale-snapshot
 * save must never resurrect it. The re-read → save pair runs under the
 * per-agent runs-file queue (runs-lock.ts), so no in-process writer can land
 * between them.
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
  const updates: RunUpdate[] = [];

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
      updates.push({
        run: {
          ...run,
          status: "error",
          summary: "The routine timed out without a response.",
          completed_at: deps.now().toISOString(),
        },
      });
      continue;
    }

    if (!reply) continue; // narrowing: timedOut is false here, so reply must be set

    // A failed turn (auth, rate limit, bad pin…) persists its typed provider
    // error on the assistant message — surface THAT as the run's error right
    // now (parity with the Rust dispatcher's visible run errors) instead of
    // classifying the empty reply or waiting out the 15-minute timeout.
    if (reply.providerError) {
      updates.push({
        run: {
          ...run,
          status: "error",
          summary: providerErrorSummary(reply.providerError),
          completed_at: deps.now().toISOString(),
        },
      });
      continue;
    }

    const done = completeRoutineRun(
      run,
      routine,
      reply.content,
      deps.now().toISOString(),
    );
    updates.push({
      run: done,
      surfacedRoutine: done.status === "surfaced" ? routine : undefined,
    });
  }
  if (updates.length === 0) return;

  // Board activities for surfaced runs, one batched save. Written BEFORE the
  // runs re-read so the re-read → runs-save pair stays await-free; the corner
  // where a cancel then drops the surfaced update leaves an activity whose
  // content the turn really did produce — acceptable, unlike a resurrected run.
  const surfaced = updates.filter((u) => u.surfacedRoutine);
  if (surfaced.length > 0) {
    const { items: activities } = await loadActivities(deps.vfs, root);
    let nextActivities = activities;
    for (const u of surfaced) {
      if (!u.surfacedRoutine) continue;
      const existing = nextActivities.find(
        (a) => a.session_key === u.run.session_key,
      );
      const activity = routineActivity(
        u.surfacedRoutine,
        u.run,
        existing,
        deps.newId(),
        deps.now().toISOString(),
      );
      nextActivities = upsertById(nextActivities, activity);
      u.run.activity_id = activity.id;
    }
    await saveActivities(deps.vfs, root, nextActivities);
  }

  // Fresh re-read under the per-agent runs-file queue: apply an update only
  // when its row is still `running` — a row a concurrent cancel flipped
  // terminal stays exactly as the user left it, and the queue keeps a
  // mid-flight fire/cancel write from being clobbered by this save.
  const applied = await withRunsFile(root, async () => {
    const fresh = await loadRoutineRuns(deps.vfs, root);
    let nextRuns = fresh.items;
    let count = 0;
    for (const u of updates) {
      const current = fresh.items.find((r) => r.id === u.run.id);
      if (current?.status !== "running") continue;
      nextRuns = upsertById(nextRuns, u.run);
      count++;
    }
    if (count > 0) await saveRoutineRuns(deps.vfs, root, nextRuns);
    return count;
  });
  if (applied > 0) {
    deps.events?.emit(ws.ownerUserId, {
      type: "RoutineRunsChanged",
      agentPath: agent.id,
    });
  }
  if (surfaced.length > 0) {
    deps.events?.emit(ws.ownerUserId, {
      type: "ActivityChanged",
      agentPath: agent.id,
    });
  }
}
