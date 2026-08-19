import { randomUUID } from "node:crypto";
import type { AdmissionLimiter } from "./admission";
import type { WorkerRegistrationConfig } from "./worker-registration-config";

const REQUEST_TIMEOUT_MS = 5_000;
let processBootId: string | undefined;

function workerBootId(): string {
  if (!processBootId) processBootId = randomUUID();
  return processBootId;
}

interface WorkerRegistrationOptions {
  fetchImpl?: typeof fetch;
  intervalMs?: number;
  bootId?: string;
  log?: (message: string) => void;
}

/** Periodically publishes this process's live admission state. */
export class WorkerRegistration {
  private readonly fetchImpl: typeof fetch;
  private readonly intervalMs: number;
  private readonly bootId: string;
  private readonly log: (message: string) => void;
  private drainingState = false;
  private stopped = false;
  private startup: Promise<void> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private wakeRetry: (() => void) | undefined;
  private requestAbort: AbortController | undefined;
  private pending = Promise.resolve();

  constructor(
    private readonly config: WorkerRegistrationConfig,
    private readonly admission: AdmissionLimiter,
    options: WorkerRegistrationOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.intervalMs = options.intervalMs ?? 15_000;
    this.bootId = options.bootId ?? workerBootId();
    this.log = options.log ?? ((message) => console.warn(message));
  }

  /** Whether SIGTERM has stopped this worker from accepting turns. */
  get draining(): boolean {
    return this.drainingState;
  }

  /** Do not let the worker serve until the gateway has acknowledged it. */
  start(): Promise<void> {
    this.startup ??= this.startUntilRegistered();
    return this.startup;
  }

  private async startUntilRegistered(): Promise<void> {
    while (!this.stopped) {
      const registered = await this.beat();
      if (registered || this.stopped) break;
      await new Promise<void>((resolve) => {
        this.wakeRetry = resolve;
        this.timer = setTimeout(resolve, this.intervalMs);
        this.timer.unref?.();
      });
      this.wakeRetry = undefined;
    }
    if (this.stopped)
      throw new Error("worker registration stopped before first success");
    this.timer = setInterval(() => void this.queueBeat(), this.intervalMs);
    this.timer.unref?.();
  }

  /** Stop admitting work and publish the transition immediately. */
  beginDraining(): Promise<void> {
    this.drainingState = true;
    return this.queueBeat();
  }

  /** Stop scheduling and abort any request still inside its timeout. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.wakeRetry?.();
    this.requestAbort?.abort();
    await this.pending;
  }

  private queueBeat(): Promise<void> {
    this.pending = this.pending.then(async () => {
      await this.beat();
    });
    return this.pending;
  }

  private async beat(): Promise<boolean> {
    if (this.stopped) return false;
    const requestAbort = new AbortController();
    this.requestAbort = requestAbort;
    try {
      const response = await this.fetchImpl(this.config.heartbeatUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workerId: this.config.workerId,
          bootId: this.bootId,
          endpoint: this.config.endpoint,
          capacity: this.admission.capacity,
          activeClaims: this.admission.active,
          draining: this.drainingState,
        }),
        signal: AbortSignal.any([
          requestAbort.signal,
          AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ]),
      });
      if (response.ok) return true;
      this.log(
        `[turn] worker registration failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
      );
    } catch (error) {
      if (this.stopped) return false;
      this.log(
        `[turn] worker registration failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (this.requestAbort === requestAbort) this.requestAbort = undefined;
    }
    return false;
  }
}

/** Apply the existing process signal to the pool lifecycle. */
export function beginWorkerShutdown(
  signal: string,
  registration: WorkerRegistration | null,
): Promise<void> {
  return signal === "SIGTERM" && registration
    ? registration.beginDraining()
    : Promise.resolve();
}
