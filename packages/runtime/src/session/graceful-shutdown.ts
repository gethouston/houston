export interface DrainableServer {
  close(callback?: (error?: Error) => void): unknown;
}

export interface GracefulShutdownDeps {
  server: DrainableServer;
  drainMs: number;
  turnsInFlight: () => number;
  exit: () => void | Promise<void>;
  log: {
    info: (...values: unknown[]) => void;
    warn: (...values: unknown[]) => void;
  };
  now?: () => number;
}

export const DRAIN_POLL_MS = 250;
export const DRAIN_SETTLE_MS = 500;

export function drainTurnsThenExit(deps: GracefulShutdownDeps): void {
  const now = deps.now ?? Date.now;
  const deadline = now() + deps.drainMs;
  const turnRunning = () => deps.turnsInFlight() > 0;
  if (turnRunning()) {
    deps.log.info("runtime draining: holding in-flight turns until they end", {
      drainMs: deps.drainMs,
    });
  }
  const tick = () => {
    if (turnRunning() && now() < deadline) {
      setTimeout(tick, DRAIN_POLL_MS);
      return;
    }
    if (turnRunning()) {
      deps.log.warn(
        "runtime drain deadline reached with a turn still running; exiting",
        { drainMs: deps.drainMs },
      );
    }
    setTimeout(() => {
      deps.server.close();
      void deps.exit();
    }, DRAIN_SETTLE_MS);
  };
  tick();
}
