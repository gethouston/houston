import type { ServerResponse } from "node:http";
import { loadRoutines } from "@houston/domain";
import { actingMayRunRoutine } from "../assistant/manager-owner";
import { ACTING_AS_HEADER, actingSubFromHeader } from "../auth/acting";
import {
  burnRoutineFireInstant,
  routineFireLockKey,
} from "../schedule/fire-lock";
import {
  decodeFireOutcome,
  encodeFireOutcome,
  FIRE_IN_FLIGHT,
  type FireOutcome,
  isRetryableFireError,
  reportUnfiredFire,
  unfiredOutcome,
} from "../schedule/fire-outcome";
import { ChannelRoutineFirer } from "../schedule/firer";
import { fireRoutineRun } from "../schedule/run";
import { authorizeAgent, DEFAULT_PATHS } from "./agent-authz";
import { json, readJson } from "./http";
import { defineRoute } from "./registry";

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

type RoutineFireReply =
  | { result: "no_routine" }
  | { result: "fired"; deduped?: true; startedAt?: string }
  | { result: "busy"; deduped?: true }
  | { result: "failed"; deduped?: true; code: string | null; error: string };

const reply = (res: ServerResponse, body: RoutineFireReply) =>
  json(res, 200, body);

const unavailable = (res: ServerResponse, detail: string) =>
  json(
    res,
    503,
    { error: "engine unavailable", detail },
    { "Retry-After": "2" },
  );

function freshReply(outcome: FireOutcome): RoutineFireReply {
  return outcome.result === "fired" ? { result: "fired" } : outcome;
}

defineRoute({
  group: "routine-fires",
  method: "POST",
  path: "/agents/:agentId/routine-fires",
  phase: "user",
  classification: "internal-control-plane",
  reason:
    "Server-to-server delivery: the control plane posts a scheduled instant to the pod, never a client.",
  source: "packages/host/src/routes/routine-fires.ts",
  handler: async ({ deps, userId, params, req, res }) => {
    if (req.headers[ACTING_AS_HEADER] !== undefined)
      return json(res, 404, { error: "not found" });

    const authz = await authorizeAgent(deps, userId, params.agentId ?? "");
    if (!authz.ok) return json(res, authz.status, { error: authz.reason });
    if (!deps.vfs)
      return json(res, 503, { error: "agent data not configured" });
    const body = parseBody(await readJson(req));
    if (!body) return json(res, 400, { error: "malformed routine fire" });

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
    if (!routine) return reply(res, { result: "no_routine" });

    const actingSub = actingSubFromHeader(body.actingAs);
    if (!actingMayRunRoutine(actingSub, routine))
      return json(res, 400, {
        error: "acting-as subject does not match routine creator",
        code: "routine_creator_mismatch",
      });
    if (!deps.routineFireLock)
      return json(res, 503, {
        error: "routine fire delivery not configured",
      });

    const ledger = deps.routineFireLock;
    const ttl = deps.routineFireDedupTtlSec ?? 3600;
    const key = routineFireLockKey(routine.id, body.fireAt);
    const burned = await burnRoutineFireInstant(
      ledger,
      routine.id,
      body.fireAt,
      ttl,
      FIRE_IN_FLIGHT,
    );
    if (!burned) {
      const recorded = decodeFireOutcome(await ledger.get(key));
      if (recorded?.result === "pending")
        return unavailable(
          res,
          "this instant's first delivery is still firing",
        );
      return reply(
        res,
        recorded
          ? { ...recorded, deduped: true }
          : { result: "fired", deduped: true },
      );
    }

    const startedAt = new Date().toISOString();
    let outcome: FireOutcome;
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
      outcome = { result: "fired", startedAt };
    } catch (error) {
      const deferred = isRetryableFireError(error);
      reportUnfiredFire(routine.id, error, deferred);
      if (deferred) {
        await ledger.del(key);
        return unavailable(
          res,
          error instanceof Error ? error.message : String(error),
        );
      }
      outcome = unfiredOutcome(error);
    }
    await ledger.set(key, encodeFireOutcome(outcome), ttl);
    reply(res, freshReply(outcome));
  },
});
