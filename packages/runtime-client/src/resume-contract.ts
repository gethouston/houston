import type { EngineError, EventStreamOptions } from "./client";
import type { WireFrame } from "./types";

export interface ConversationEventSource {
  streamEvents(id: string, opts: EventStreamOptions): Promise<void>;
}

export interface ResumableBackoff {
  initialMs?: number;
  maxMs?: number;
  jitter?: (capMs: number) => number;
}

export interface ResumeRetryInfo {
  consecutiveFailures: number;
  error: unknown;
}

export const FATAL_RESUME_STATUSES: ReadonlySet<number> = new Set([
  401, 403, 404, 410,
]);

export class FatalResumeError extends Error {
  readonly status: number;
  constructor(override readonly cause: EngineError) {
    super(`conversation stream refused (${cause.status}); not retrying`);
    this.name = "FatalResumeError";
    this.status = cause.status;
  }
}

export interface ResumableStreamOptions {
  signal: AbortSignal;
  onEvent: (frame: WireFrame) => void;
  after?: number;
  onRetry?: (info: ResumeRetryInfo) => void;
  idleTimeoutMs?: number;
  backoff?: ResumableBackoff;
}

export const DEFAULT_IDLE_TIMEOUT_MS = 45_000;
export const DEFAULT_BACKOFF_INITIAL_MS = 500;
export const DEFAULT_BACKOFF_MAX_MS = 10_000;
