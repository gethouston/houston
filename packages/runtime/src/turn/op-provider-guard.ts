export class WorkerOpDeclinedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerOpDeclinedError";
  }
}

export function assertWorkerOpProvider(provider: string): void {
  if (provider === "anthropic")
    throw new WorkerOpDeclinedError(
      "anthropic one-shot model calls require the standing pod",
    );
}
