import type { MigrationStep } from "./cloud-migration-progress.ts";
import { isNetworkTransportError } from "./network-transport-error.ts";

export type RunnableStep = Exclude<MigrationStep, "error">;

export class MigrationStepError extends Error {
  readonly step: RunnableStep;
  constructor(step: RunnableStep, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "MigrationStepError";
    this.step = step;
  }
}

export class MigrationAbandonedError extends Error {
  constructor() {
    super("migration deferred by the user while a task was in flight");
    this.name = "MigrationAbandonedError";
  }
}

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
  | { kind: "abandoned" }
  | {
      kind: "failed";
      step: RunnableStep;
      message: string;
      cause: unknown;
      transport: boolean;
    };

export function migrationFailureCause(err: unknown): unknown {
  return err instanceof MigrationStepError ? err.cause : err;
}

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
