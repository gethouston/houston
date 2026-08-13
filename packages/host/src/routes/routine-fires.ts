import type { IncomingMessage, ServerResponse } from "node:http";
import { loadRoutines } from "@houston/domain";
import { ACTING_AS_HEADER, actingSubFromHeader } from "../auth/acting";
import { burnRoutineFireInstant, type FireLock } from "../schedule/fire-lock";
import { ChannelRoutineFirer } from "../schedule/firer";
import { fireRoutineRun, RoutineBusyError } from "../schedule/run";
import {
  type AgentRouteDeps,
  authorizeAgent,
  DEFAULT_PATHS,
} from "./agent-authz";
import { json, readJson } from "./http";

export interface RoutineFiresDeps extends AgentRouteDeps {
  routineFireLock?: FireLock;
  routineFireDedupTtlSec?: number;
}

interface RoutineFireBody {
  routineId: string;
  fireAt: Date;
  actingAs: string;
}

function parseBody(raw: unknown): RoutineFireBody | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  if (
    typeof body.routineId !== "string" ||
    typeof body.fireAt !== "string" ||
    typeof body.actingAs !== "string"
  ) {
    return null;
  }
  const fireAt = new Date(body.fireAt);
  if (Number.isNaN(fireAt.getTime())) return null;
  return { routineId: body.routineId, fireAt, actingAs: body.actingAs };
}

/** Internal control-plane → pod delivery of one scheduled routine instant. */
export async function handleRoutineFires(
  deps: RoutineFiresDeps,
  userId: string,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const match = path.match(/^\/agents\/([^/]+)\/routine-fires$/);
  if (!match || method !== "POST") return false;

  // As with trigger-events, a proxied user request carries this header. The
  // internal delivery uses the pod token and carries its minted C2 token only
  // in the body, so reject externally reachable requests in depth.
  if (req.headers[ACTING_AS_HEADER] !== undefined) {
    json(res, 404, { error: "not found" });
    return true;
  }

  const authz = await authorizeAgent(
    deps,
    userId,
    decodeURIComponent(match[1] ?? ""),
  );
  if (!authz.ok) {
    json(res, authz.status, { error: authz.reason });
    return true;
  }
  if (!deps.vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const body = parseBody(await readJson(req));
  if (!body) {
    json(res, 400, { error: "malformed routine fire" });
    return true;
  }
  const paths = deps.paths ?? DEFAULT_PATHS;
  const root = paths.agentRoot(authz.workspace, authz.agent);
  const { items: routines } = await loadRoutines(deps.vfs, root);
  const routine = routines.find(
    (candidate) =>
      candidate.id === body.routineId &&
      candidate.enabled &&
      candidate.schedule &&
      !candidate.trigger,
  );
  if (!routine) {
    json(res, 200, { result: "no_routine" });
    return true;
  }

  // Pods do not hold the gateway HMAC key. On this pod-token-authenticated
  // internal route, match the strongest existing trusted-gateway pattern:
  // decode the minted payload and require its subject to equal created_by.
  const actingSub = actingSubFromHeader(body.actingAs);
  if (!actingSub || !routine.created_by || actingSub !== routine.created_by) {
    json(res, 400, {
      error: "acting-as subject does not match routine creator",
      code: "routine_creator_mismatch",
    });
    return true;
  }
  if (!deps.routineFireLock) {
    json(res, 503, { error: "routine fire delivery not configured" });
    return true;
  }

  const fresh = await burnRoutineFireInstant(
    deps.routineFireLock,
    routine.id,
    body.fireAt,
    deps.routineFireDedupTtlSec ?? 3600,
  );
  if (!fresh) {
    json(res, 200, { result: "fired", deduped: true });
    return true;
  }

  try {
    await fireRoutineRun(
      {
        vfs: deps.vfs,
        paths,
        firer: new ChannelRoutineFirer(deps.channels, body.actingAs),
        events: deps.events,
        now: () => new Date(),
        newId: () => crypto.randomUUID(),
      },
      authz.workspace,
      authz.agent,
      routine,
    );
    json(res, 200, { result: "fired" });
  } catch (error) {
    if (error instanceof RoutineBusyError) {
      json(res, 200, { result: "busy" });
      return true;
    }
    throw error;
  }
  return true;
}
