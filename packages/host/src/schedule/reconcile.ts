import {
  loadActivities,
  loadRoutineRuns,
  loadRoutines,
  routineActivity,
  saveActivities,
  saveRoutineRuns,
  upsertById,
} from "@houston/domain";
import type { Routine, RoutineRun } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { decideRun, type RunUpdate } from "./reconcile-decide";
import { loadRunReplies, type ReplyReader } from "./reconcile-replies";
import { withRunsFile } from "./runs-lock";
import { settleRoutineRuns } from "./snooze";

export interface ReconcileDeps {
  vfs: Vfs;
  paths: WorkspacePaths;
  lock: { setNx(key: string, value: string, ttlSec: number): Promise<boolean> };
  events?: EventHub;
  now: () => Date;
  newId: () => string;
  replyReader?: ReplyReader;
  settleRuns?: (settled: RoutineRun[]) => Promise<void>;
}

export interface ReconcileScope {
  conversationId?: string;
  abandoned?: ReadonlySet<string>;
}

export async function reconcileAgentRuns(
  deps: ReconcileDeps,
  ws: Workspace,
  agent: Agent,
  scope: ReconcileScope = {},
): Promise<void> {
  const root = deps.paths.agentRoot(ws, agent);
  const { items: runs } = await loadRoutineRuns(deps.vfs, root);
  const running = runs.filter(
    (r) =>
      r.status === "running" &&
      (scope.conversationId === undefined ||
        r.session_key === scope.conversationId),
  );
  if (running.length === 0) return;

  const { items: routines, diagnostics } = await loadRoutines(deps.vfs, root);
  const runIds = new Set(runs.map((r) => r.id));
  const nowMs = deps.now().getTime();
  const updates: RunUpdate[] = [];
  const candidates = running.flatMap(
    (run): { run: RoutineRun; routine: Routine | null }[] => {
      const routine = routines.find((item) => item.id === run.routine_id);
      if (routine) return [{ run, routine }];
      return diagnostics.length === 0 ? [{ run, routine: null }] : [];
    },
  );
  const replies = await loadRunReplies(
    deps,
    ws,
    agent,
    candidates.map((c) => c.run),
    scope.abandoned,
  );

  for (const [index, { run, routine }] of candidates.entries()) {
    const decision = decideRun({
      run,
      routine,
      reply: replies[index] ?? null,
      nowMs,
      nowIso: deps.now().toISOString(),
      abandoned: scope.abandoned?.has(run.id) === true,
      runIds,
    });
    if (decision.kind === "wait") continue;
    if (decision.kind === "patch") {
      updates.push(decision.update);
      continue;
    }
    if (!(await deps.lock.setNx(`routine:reconcile:${run.id}`, "1", 120)))
      continue;
    updates.push(decision.update);
  }
  if (updates.length === 0) return;

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

  const settled: RoutineRun[] = [];
  const applied = await withRunsFile(root, async () => {
    const fresh = await loadRoutineRuns(deps.vfs, root);
    let nextRuns = fresh.items;
    let count = 0;
    for (const u of updates) {
      const current = fresh.items.find((r) => r.id === u.run.id);
      if (current?.status !== "running") continue;
      nextRuns = upsertById(
        nextRuns,
        u.patch ? { ...current, ...u.patch } : u.run,
      );
      if (!u.patch) settled.push(u.run);
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
  if (deps.settleRuns) await deps.settleRuns(settled);
  else await settleRoutineRuns(deps, ws, agent, root, settled);
}
