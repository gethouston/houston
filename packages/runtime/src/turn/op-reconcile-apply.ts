import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  createRoutineRun,
  loadRoutineRuns,
  loadRoutines,
  pruneRoutineRuns,
  routineConversationId,
  saveRoutineRuns,
} from "@houston/domain";
import type { Agent, Workspace } from "@houston/host/src/domain/types";
import type { EventHub } from "@houston/host/src/events/hub";
import { LocalPaths } from "@houston/host/src/paths";
import {
  type ReconcileDeps,
  reconcileAgentRuns,
} from "@houston/host/src/schedule/reconcile";
import { withRunsFile } from "@houston/host/src/schedule/runs-lock";
import { LocalWorkspaceStore } from "@houston/host/src/store/local";
import { PrefixedVfs } from "@houston/host/src/vfs";
import type { ChatMessage, HoustonEvent } from "@houston/protocol";
import type { AbandonedTurn, ReconcileOp } from "./op-grammar-reconcile";
import { repairSurfacedCards } from "./op-reconcile-board";
import { settleAbandonedChat } from "./op-reconcile-chat";
import { engineAgentId } from "./op-scope";
import type { TurnFilesystem } from "./turn-filesystem";

export interface ReconcileApplied {
  events: HoustonEvent[];
  line?: ChatMessage;
  chat: string;
  decline?: true;
}

export async function applyReconcileOp(
  op: ReconcileOp,
  filesystem: TurnFilesystem,
): Promise<ReconcileApplied> {
  const agentId = engineAgentId(filesystem);
  const store = new LocalWorkspaceStore(
    join(filesystem.storeRoot, "workspaces"),
  );
  const agent = await store.getAgent(agentId);
  const ws = agent ? await store.getWorkspace(agent.workspaceId) : null;
  if (!agent || !ws)
    return { events: [], chat: "agent_missing", decline: true };
  const events: HoustonEvent[] = [];
  const { abandoned } = op;
  let chat = "none";
  let line: ChatMessage | undefined;
  if (abandoned) {
    const settled = await settleAbandonedChat(
      filesystem,
      op.conversationId,
      abandoned,
    );
    if ("tooLarge" in settled)
      return { events: [], chat: "too_large", decline: true };
    if ("privateRefused" in settled)
      return { events: [], chat: "private_refused", decline: true };
    if ("line" in settled) {
      line = settled.line;
      chat = settled.written ? "settled" : "already_settled";
      if (settled.written)
        events.push({ type: "ConversationsChanged", agentPath: agentId });
    } else {
      chat = settled.skipped;
    }
  }
  const deps: ReconcileDeps = {
    vfs: new PrefixedVfs(filesystem.vfs, "workspaces"),
    paths: new LocalPaths(),
    lock: { setNx: async () => true },
    events: collect(events),
    now: () => new Date(),
    newId: randomUUID,
    settleRuns: async () => {},
  };
  if (abandoned?.routine)
    await recordLostRun(deps, ws, agent, op.conversationId, abandoned);
  await reconcileAgentRuns(deps, ws, agent, {
    conversationId: op.conversationId,
    ...(abandoned ? { abandoned: new Set([abandoned.turnId]) } : {}),
  });
  const root = deps.paths.agentRoot(ws, agent);
  const now = new Date().toISOString();
  if (await repairSurfacedCards(deps.vfs, root, op.conversationId, now))
    events.push({ type: "ActivityChanged", agentPath: agentId });
  return { events, chat, ...(line ? { line } : {}) };
}

async function recordLostRun(
  deps: ReconcileDeps,
  ws: Workspace,
  agent: Agent,
  conversationId: string,
  abandoned: AbandonedTurn,
): Promise<void> {
  const root = deps.paths.agentRoot(ws, agent);
  const { items: routines } = await loadRoutines(deps.vfs, root);
  const routine = routines.find(
    (r) => routineConversationId(r, abandoned.turnId) === conversationId,
  );
  if (!routine) return;
  await withRunsFile(root, async () => {
    const { items: runs } = await loadRoutineRuns(deps.vfs, root);
    if (runs.some((r) => r.id === abandoned.turnId)) return;
    const lost = createRoutineRun(
      routine,
      abandoned.turnId,
      abandoned.startedAt,
    );
    await saveRoutineRuns(deps.vfs, root, pruneRoutineRuns([lost, ...runs]));
  });
}

function collect(into: HoustonEvent[]): EventHub {
  return {
    emit: (_userId, event) => {
      into.push(event);
    },
    subscribe: () => () => {},
  };
}
