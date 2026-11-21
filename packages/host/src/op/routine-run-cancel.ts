import type { IncomingMessage, ServerResponse } from "node:http";
import { json, readJson } from "../routes/http";
import { cancelRunRow, type StoppedPooledRun } from "../schedule/cancel";
import type { AgentOpChainDeps } from "./handler-chain";

const RUN_CANCEL = /^routines\/([^/]+)\/runs\/([^/]+)\/cancel$/;

function decoded(segment: string | undefined): string | null {
  try {
    return segment ? decodeURIComponent(segment) : null;
  } catch {
    return null;
  }
}

type Stopped = { ok: true; stopped?: StoppedPooledRun } | { ok: false };

async function readStopped(
  req: IncomingMessage,
  routineId: string,
  runId: string,
): Promise<Stopped> {
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return { ok: false };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return { ok: false };
  const raw = (body as Record<string, unknown>).stopped;
  if (raw === undefined) return { ok: true };
  if (typeof raw !== "object" || raw === null) return { ok: false };
  const { sessionKey, startedAt } = raw as Record<string, unknown>;
  const conversations = [
    `routine-${routineId}`,
    `routine-${routineId}-${runId}`,
  ];
  if (typeof sessionKey !== "string" || !conversations.includes(sessionKey))
    return { ok: false };
  if (typeof startedAt !== "string" || Number.isNaN(Date.parse(startedAt)))
    return { ok: false };
  return { ok: true, stopped: { sessionKey, startedAt } };
}

export async function handleRoutineRunCancelOp(
  deps: AgentOpChainDeps,
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const match = method === "POST" ? RUN_CANCEL.exec(rest) : null;
  const routineId = decoded(match?.[1]);
  const runId = decoded(match?.[2]);
  if (!routineId || !runId) return false;
  const body = await readStopped(req, routineId, runId);
  if (!body.ok) {
    json(res, 400, { error: "invalid 'stopped'" });
    return true;
  }
  const { workspace, agent } = deps.ctx;
  const result = await cancelRunRow(
    { vfs: deps.vfs, paths: deps.paths, now: () => new Date() },
    workspace,
    agent,
    routineId,
    runId,
    body.stopped,
  );
  if (result.status === "not_found") {
    json(res, 404, { error: "run not found" });
    return true;
  }
  if (result.status === "not_running") {
    json(res, 409, { error: "run is not running" });
    return true;
  }
  deps.emit({ type: "RoutineRunsChanged", agentPath: agent.id });
  json(res, 200, result.run);
  return true;
}
