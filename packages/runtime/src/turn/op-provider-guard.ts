/** A worker op that must be retried by the standing pod without partial state. */
export class WorkerOpDeclinedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerOpDeclinedError";
  }
}

/** Keep Anthropic one-shots off pi even if gateway routing regresses. */
export function assertWorkerOpProvider(provider: string): void {
  if (provider === "anthropic")
    throw new WorkerOpDeclinedError(
      "anthropic one-shot model calls require the standing pod",
    );
}
