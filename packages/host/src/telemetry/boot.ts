import { Gauge, Registry } from "prom-client";

export type BootStep =
  | "module_eval"
  | "hydrate"
  | "migrations"
  | "listen"
  | "runtime_spawn";

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

  get contentType(): string {
    return this.registry.contentType;
  }

  record(step: BootStep, ms: number): void {
    this.steps.set(step, ms);
    this.stepSeconds.set({ step }, ms / 1000);
  }

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

  markReady(): void {
    this.totalMs = process.uptime() * 1000;
    this.totalSeconds.set(this.totalMs / 1000);
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

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
