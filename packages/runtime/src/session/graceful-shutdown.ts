/**
 * Server-mode shutdown: hold the process alive until every in-flight turn has
 * ended (or the drain budget is spent), THEN close the listener and exit —
 * exactly once, from here.
 *
 * The listener stays up for the whole drain on purpose. Turns are
 * fire-and-forget (the start route answers 202 and the turn runs on the bus),
 * so nothing holds an HTTP connection open while a turn runs and a
 * `server.close(cb)` at signal time completes at once. Exiting from that
 * callback — the pre-drain shape — killed a pod's running turns within
 * seconds of SIGTERM while 589 s of termination grace went unused
 * (PRODUCT-1758). Keeping the listener open is also what lets the drain latch
 * (drain.ts) answer: new turns get 503 + Retry-After and `/busy` reads true,
 * so the host's activity probe keeps reporting the pod busy until it is gone.
 */

export interface DrainableServer {
  close(callback?: (error?: Error) => void): unknown;
}

export interface GracefulShutdownDeps {
  server: DrainableServer;
  /** How long a still-running turn may hold the process (HOUSTON_RUNTIME_DRAIN_MS). */
  drainMs: number;
  anyTurnRunning: () => boolean;
  /** Final exit: flushes and calls process.exit. Invoked exactly once. */
  exit: () => void | Promise<void>;
  log: {
    info: (...values: unknown[]) => void;
    warn: (...values: unknown[]) => void;
  };
  now?: () => number;
}

/** How often the drain re-checks for a still-running turn. */
export const DRAIN_POLL_MS = 250;
/**
 * The beat after the last turn ends before the listener goes away, so the
 * turn's terminal frame reaches the host's capture first.
 */
export const DRAIN_SETTLE_MS = 500;

export function drainTurnsThenExit(deps: GracefulShutdownDeps): void {
  const now = deps.now ?? Date.now;
  const deadline = now() + deps.drainMs;
  if (deps.anyTurnRunning()) {
    deps.log.info("runtime draining: holding in-flight turns until they end", {
      drainMs: deps.drainMs,
    });
  }
  // Timers stay ref'd: the drain is the one thing keeping this process alive
  // once the host has dropped its connections, and an unref'd settle timer
  // would let Node exit naturally before `exit` flushed the logs.
  const tick = () => {
    if (deps.anyTurnRunning() && now() < deadline) {
      setTimeout(tick, DRAIN_POLL_MS);
      return;
    }
    if (deps.anyTurnRunning()) {
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
