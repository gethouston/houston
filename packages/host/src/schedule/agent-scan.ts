import { dueAt, loadRoutines } from "@houston/domain";
import type { Routine } from "@houston/protocol";
import { TurnFireError } from "../channel/fire-error";
import type { Agent, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { burnRoutineFireInstant, type FireLock } from "./fire-lock";
import { type ReconcileDeps, reconcileAgentRuns } from "./reconcile";
import { fireRoutineRun, RoutineBusyError } from "./run";
import { clearScanFailure, shouldLogScanFailure } from "./scan-failure-log";

export interface FiringJob {
  workspace: Workspace;
  agent: Agent;
  routine: Routine;
  conversationId: string;
  runId: string;
}

export interface RoutineFirer {
  fire(job: FiringJob): Promise<void>;
}

export interface AgentScanDeps {
  vfs: Vfs;
  paths: WorkspacePaths;
  lock: FireLock;
  firer: RoutineFirer;
  events?: EventHub;
  now: () => Date;
  newId: () => string;
  dedupTtlSec: number;
  cronFiresEnabled: boolean;
  replyReader?: ReconcileDeps["replyReader"];
}

const reason = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

export async function scanAgent(
  deps: AgentScanDeps,
  ws: Workspace,
  agent: Agent,
  timezone: string | null,
  since: Date,
  now: Date,
): Promise<void> {
  const where = `${ws.id}/${agent.id}`;
  try {
    if (deps.cronFiresEnabled) {
      const root = deps.paths.agentRoot(ws, agent);
      const { items: routines } = await loadRoutines(deps.vfs, root);
      for (const routine of routines) {
        const at = dueAt(routine, since, now, timezone);
        if (!at) continue;
        const won = await burnRoutineFireInstant(
          deps.lock,
          routine.id,
          at,
          deps.dedupTtlSec,
        );
        if (won) await fireRoutine(deps, ws, agent, routine);
      }
    }
    clearScanFailure(where);
  } catch (err) {
    const why = reason(err);
    if (shouldLogScanFailure(where, why, Date.now())) {
      console.error(`[scheduler] ${where} routine scan failed:`, why);
    }
  }

  await reconcile(deps, ws, agent, where);
}

async function reconcile(
  deps: AgentScanDeps,
  ws: Workspace,
  agent: Agent,
  where: string,
): Promise<void> {
  try {
    await reconcileAgentRuns(
      {
        vfs: deps.vfs,
        paths: deps.paths,
        lock: deps.lock,
        events: deps.events,
        now: deps.now,
        newId: deps.newId,
        replyReader: deps.replyReader,
      },
      ws,
      agent,
    );
  } catch (err) {
    console.error(`[scheduler] ${where} run reconcile failed:`, reason(err));
  }
}

async function fireRoutine(
  deps: AgentScanDeps,
  ws: Workspace,
  agent: Agent,
  routine: Routine,
): Promise<void> {
  try {
    await fireRoutineRun(
      {
        vfs: deps.vfs,
        paths: deps.paths,
        firer: deps.firer,
        events: deps.events,
        now: deps.now,
        newId: deps.newId,
      },
      ws,
      agent,
      routine,
    );
  } catch (err) {
    if (err instanceof RoutineBusyError) return;
    if (err instanceof TurnFireError && err.code === "no_provider") {
      console.warn(`[scheduler] routine ${routine.id} skipped: ${err.message}`);
      return;
    }
    console.error(
      `[scheduler] routine ${routine.id} fire failed:`,
      reason(err),
    );
  }
}
