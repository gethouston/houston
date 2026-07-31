import { Gauge, Registry } from "prom-client";

/**
 * The named phases of a host boot, in the order they run. `runtime_spawn` only
 * exists on managed pods (HOUSTON_EAGER_RUNTIME) — the desktop spawns runtimes
 * lazily, after boot. The wire names are shared with the gateway's
 * boot-report ingest; adding a step means whitelisting it there too.
 */
export type BootStep =
  | "module_eval"
  | "hydrate"
  | "migrations"
  | "listen"
  | "runtime_spawn";

/**
 * The boot-span ledger (HOU-1011): every boot phase's duration, recorded once
 * per process. Serves two consumers from one record:
 *  - `GET /metrics` on this host (Prometheus text exposition, via prom-client);
 *  - the one-shot boot report a managed pod pushes to the gateway right after
 *    it becomes ready (pods scale to zero, so a scraper would miss the boot).
 */
export class BootTelemetry {
  private readonly registry = new Registry();
  private readonly stepSeconds: Gauge<"step">;
  private readonly hydratedObjectsGauge: Gauge;
  private readonly totalSeconds: Gauge;
  private readonly steps = new Map<BootStep, number>();
  private hydratedObjects: number | undefined;
  private totalMs: number | undefined;

  constructor() {
    this.stepSeconds = new Gauge({
      name: "houston_engine_boot_step_duration_seconds",
      help: "Duration of one named host boot phase, seconds.",
      labelNames: ["step"],
      registers: [this.registry],
    });
    this.hydratedObjectsGauge = new Gauge({
      name: "houston_engine_boot_hydrated_objects",
      help: "Objects restored from the durable store during boot hydration.",
      registers: [this.registry],
    });
    this.totalSeconds = new Gauge({
      name: "houston_engine_boot_total_duration_seconds",
      help: "Process start to listening banner, seconds.",
      registers: [this.registry],
    });
  }

  /** Prometheus exposition content type (constant, but read from the lib). */
  get contentType(): string {
    return this.registry.contentType;
  }

  record(step: BootStep, ms: number): void {
    this.steps.set(step, ms);
    this.stepSeconds.set({ step }, ms / 1000);
  }

  /** Time an async boot phase and record it, passing the result through. */
  async time<T>(step: BootStep, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      this.record(step, Date.now() - t0);
    }
  }

  setHydratedObjects(count: number): void {
    this.hydratedObjects = count;
    this.hydratedObjectsGauge.set(count);
  }

  /** Stamp total boot time = process start → now (call at the banner). */
  markReady(): void {
    this.totalMs = process.uptime() * 1000;
    this.totalSeconds.set(this.totalMs / 1000);
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  /** The gateway boot-report body (wire contract with the Go ingest). */
  reportPayload(): {
    steps: Array<{ step: BootStep; ms: number }>;
    hydratedObjects?: number;
    totalMs?: number;
  } {
    return {
      steps: [...this.steps].map(([step, ms]) => ({ step, ms })),
      ...(this.hydratedObjects !== undefined
        ? { hydratedObjects: this.hydratedObjects }
        : {}),
      ...(this.totalMs !== undefined ? { totalMs: this.totalMs } : {}),
    };
  }
}
