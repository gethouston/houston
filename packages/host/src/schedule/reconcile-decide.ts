import { completeRoutineRun, ROUTINE_RUN_TIMEOUT_MS } from "@houston/domain";
import type { ChatMessage, Routine, RoutineRun } from "@houston/protocol";
import { routineRunErrorSummary, routineRunFailure } from "./run-failure";

export const INTERRUPTED_RUN_SUMMARY =
  "The routine was interrupted before it finished.";

export const ORPHANED_RUN_SUMMARY = "This run's routine was deleted.";

export interface RunUpdate {
  run: RoutineRun;
  patch?: Partial<RoutineRun>;
  surfacedRoutine?: Routine;
}

export type RunDecision =
  | { kind: "wait" }
  | { kind: "patch"; update: RunUpdate }
  | { kind: "settle"; update: RunUpdate };

export function decideRun(input: {
  run: RoutineRun;
  routine: Routine | null;
  reply: ChatMessage | null;
  nowMs: number;
  nowIso: string;
  abandoned: boolean;
  runIds: ReadonlySet<string>;
}): RunDecision {
  const { run, routine, nowIso } = input;
  const end = (ended: RoutineRun): RunDecision =>
    settle(routine ? ended : orphaned(run, nowIso));
  const stamp = input.reply?.turnId;
  const foreign =
    stamp !== undefined &&
    stamp !== run.id &&
    (input.abandoned || input.runIds.has(stamp));
  const reply = foreign ? null : input.reply;
  if (input.abandoned && (!reply || reply.interrupted !== undefined)) {
    return end({
      ...run,
      status: "error",
      summary: INTERRUPTED_RUN_SUMMARY,
      completed_at: nowIso,
    });
  }
  const resumedReply = reply?.interrupted?.resumed === true ? reply : null;
  const clockStartMs = resumedReply
    ? resumedReply.ts
    : Date.parse(run.started_at);
  const timedOut =
    (!reply || resumedReply !== null) &&
    input.nowMs - clockStartMs > ROUTINE_RUN_TIMEOUT_MS;
  if (timedOut) {
    return end({
      ...run,
      status: "error",
      summary: "The routine timed out without a response.",
      completed_at: nowIso,
    });
  }
  if (!reply) return { kind: "wait" };
  if (resumedReply) {
    return run.resumed
      ? { kind: "wait" }
      : { kind: "patch", update: { run, patch: { resumed: true } } };
  }

  if (reply.providerError) {
    const failure = routineRunFailure(reply.providerError);
    return end({
      ...run,
      status: "error",
      summary: routineRunErrorSummary(failure, reply.providerError),
      ...(failure ? { failure } : {}),
      completed_at: nowIso,
    });
  }

  if (!routine) return settle(orphaned(run, nowIso));
  const done = completeRoutineRun(run, routine, reply.content, nowIso);
  return {
    kind: "settle",
    update: {
      run: done,
      surfacedRoutine: done.status === "surfaced" ? routine : undefined,
    },
  };
}

const orphaned = (run: RoutineRun, nowIso: string): RoutineRun => ({
  ...run,
  status: "cancelled",
  summary: ORPHANED_RUN_SUMMARY,
  completed_at: nowIso,
});

const settle = (run: RoutineRun): RunDecision => ({
  kind: "settle",
  update: { run },
});
