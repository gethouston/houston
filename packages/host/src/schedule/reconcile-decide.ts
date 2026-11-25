import { completeRoutineRun, ROUTINE_RUN_TIMEOUT_MS } from "@houston/domain";
import type { ChatMessage, Routine, RoutineRun } from "@houston/protocol";
import { routineRunErrorSummary, routineRunFailure } from "./run-failure";

/** The run-row sentence for a run whose turn died before it finished. */
export const INTERRUPTED_RUN_SUMMARY =
  "The routine was interrupted before it finished.";

/** The run-row sentence for a run whose routine was deleted. */
export const ORPHANED_RUN_SUMMARY = "This run's routine was deleted.";

/** One sweep's decision for a run, applied only if the row is still `running`. */
export interface RunUpdate {
  run: RoutineRun;
  /**
   * A NON-terminal field write. `run` is a snapshot taken before this sweep's
   * awaits, so writing it back would revert whatever else changed on a row
   * that stays `running` (a pause, an activity id). A patch is merged onto the
   * FRESH row instead. Terminal updates keep replacing the row wholesale:
   * there, the snapshot IS the decision and nothing may survive it.
   */
  patch?: Partial<RoutineRun>;
  /** Set when the update surfaces content — drives the board Activity. */
  surfacedRoutine?: Routine;
}

/**
 * What a sweep does with one running run: leave it in flight, record a
 * resume (no completion lock: the resumed turn's real reply must still win it
 * on a later sweep), or settle it (one replica owns that, under the lock).
 *
 * A run whose routine is gone (deleted mid-run, often by the agent itself
 * for a one-shot routine) waits on the same
 * clock as any other run, so a turn still in flight is never cut short. Once
 * its turn is over it settles `cancelled`: nothing is left to classify its
 * reply against, and a row left `running` holds its engine busy forever.
 */
export type RunDecision =
  | { kind: "wait" }
  | { kind: "patch"; update: RunUpdate }
  | { kind: "settle"; update: RunUpdate };

export function decideRun(input: {
  run: RoutineRun;
  /** null when the run's routine no longer exists. */
  routine: Routine | null;
  reply: ChatMessage | null;
  nowMs: number;
  nowIso: string;
  /** The run's turn is known dead: no reply is coming, and a resume never. */
  abandoned: boolean;
  /** Every run id in the history: a pooled run's id IS its turn id. */
  runIds: ReadonlySet<string>;
}): RunDecision {
  const { run, routine, nowIso } = input;
  const end = (ended: RoutineRun): RunDecision =>
    settle(routine ? ended : orphaned(run, nowIso));
  // In a shared chat a reply stamped with another run's turn is that run's,
  // never this one's; a dead pooled turn is answered by its own id or not at
  // all.
  const stamp = input.reply?.turnId;
  const foreign =
    stamp !== undefined &&
    stamp !== run.id &&
    (input.abandoned || input.runIds.has(stamp));
  const reply = foreign ? null : input.reply;
  // A dead turn's only reply is its interruption line (or none at all): the
  // run is over, and waiting out the timeout would only delay saying so.
  if (input.abandoned && (!reply || reply.interrupted !== undefined)) {
    return end({
      ...run,
      status: "error",
      summary: INTERRUPTED_RUN_SUMMARY,
      completed_at: nowIso,
    });
  }
  // An `interrupted.resumed` reply is the engine saying "I died mid-run and
  // am running this turn again myself" (PRODUCT-1785) — a pause, not the
  // run's answer. Its 15-minute budget restarts from that interruption: the
  // work began again there, and timing it out against the ORIGINAL start
  // would kill a resume that only had seconds of the first window left.
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
  if (!reply) return { kind: "wait" }; // turn still in flight
  if (resumedReply) {
    // Writing the same flag from two replicas is idempotent.
    return run.resumed
      ? { kind: "wait" }
      : { kind: "patch", update: { run, patch: { resumed: true } } };
  }

  // A failed turn (auth, rate limit, bad pin…) persists its typed provider
  // error on the assistant message — surface THAT as the run's error right
  // now (parity with the Rust dispatcher's visible run errors) instead of
  // classifying the empty reply or waiting out the 15-minute timeout.
  if (reply.providerError) {
    // A credential-level wall gets the honest, whose-account-is-it sentence
    // (PRODUCT-1475): the raw provider message says "no provider connected"
    // to a reader whose OWN account is connected. Everything else keeps the
    // verbatim provider text.
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
