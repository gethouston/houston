/**
 * The per-step envelope of the cloud-migration runner (HOU-719), kept
 * dependency-free so it is `node --test`-able: a failure carries the step it
 * failed in (`MigrationStepError`) so the store can park the row in a
 * retryable error state, and no step starts once the user has bailed out of
 * the run (`MigrationAbandonedError`).
 */

import type { MigrationStep } from "./cloud-migration-progress.ts";
import { isNetworkTransportError } from "./network-transport-error.ts";

export type RunnableStep = Exclude<MigrationStep, "error">;

/**
 * Keeps the wrapped failure on `cause`: the error-surfacing layer classifies
 * a connectivity drop by the browser's `TypeError`, which the envelope alone
 * would hide (every upload cut by the network then filed as a bug).
 */
export class MigrationStepError extends Error {
  readonly step: RunnableStep;
  constructor(step: RunnableStep, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "MigrationStepError";
    this.step = step;
  }
}

/**
 * The user chose "Migrate later" while this task was in flight. Deferring
 * kills the loopback source host at once, so any later export against it is
 * guaranteed to fail with a transport error that looks like a bug but is the
 * user's own bail-out. The runner throws this instead of starting the step.
 */
export class MigrationAbandonedError extends Error {
  constructor() {
    super("migration deferred by the user while a task was in flight");
    this.name = "MigrationAbandonedError";
  }
}

/** Run one step: refuse to start once abandoned, tag any failure with `name`. */
export async function runStep<T>(
  name: RunnableStep,
  work: () => Promise<T>,
  isAbandoned: () => boolean,
): Promise<T> {
  if (isAbandoned()) throw new MigrationAbandonedError();
  try {
    return await work();
  } catch (err) {
    throw err instanceof MigrationStepError
      ? err
      : new MigrationStepError(name, err);
  }
}

export type TaskFailureOutcome =
  /** Expected: the run was deferred; the row goes back to `pending`. */
  | { kind: "abandoned" }
  /** A real failure: park the row in `error` and report it. */
  | {
      kind: "failed";
      step: RunnableStep;
      message: string;
      /** The failure under the step envelope: what Sentry classifies on. */
      cause: unknown;
      /** The request never got an answer (device offline, upload cut by the
       *  network): the row shows authored copy, the report takes the quiet
       *  connectivity path instead of filing a bug. */
      transport: boolean;
    };

/** The failure a step envelope wraps; anything else is its own cause. */
export function migrationFailureCause(err: unknown): unknown {
  return err instanceof MigrationStepError ? err.cause : err;
}

/**
 * A failure that lands after the user deferred is the consequence of the
 * teardown, not a defect — whether the runner refused the step or a fetch
 * raced the source-host stop between the guard and the request — so
 * `deferred` decides, never the error's shape.
 */
export function taskFailureOutcome(
  err: unknown,
  deferred: boolean,
): TaskFailureOutcome {
  if (deferred || err instanceof MigrationAbandonedError) {
    return { kind: "abandoned" };
  }
  const cause = migrationFailureCause(err);
  return {
    kind: "failed",
    step: err instanceof MigrationStepError ? err.step : "uploading",
    message: err instanceof Error ? err.message : String(err),
    cause,
    transport: isNetworkTransportError(cause),
  };
}
