import type { Server } from "node:http";

/**
 * Graceful drain for the control plane (zero-downtime deploys).
 *
 * On SIGTERM (Kubernetes pod termination) the server stops accepting new
 * connections and lets in-flight requests finish. SSE streams (turn relays,
 * event subscriptions) never end on their own, so a grace timer forces exit
 * after `graceMs` — clients reconnect to the replacement pod and catch up via
 * the `sync` frame. Combined with the Deployment's RollingUpdate
 * (maxUnavailable=0) + preStop sleep, requests never land on a dead pod.
 */
export interface ShutdownOptions {
  /** How long in-flight work may run after the drain starts. Default 20s. */
  graceMs?: number;
  log?: (message: string) => void;
  /** Injectable for tests; defaults to process.exit. */
  exit?: (code: number) => void;
}

export function installGracefulShutdown(
  server: Pick<Server, "close" | "closeIdleConnections">,
  opts: ShutdownOptions = {},
): (signal: string) => void {
  const graceMs = opts.graceMs ?? 20_000;
  const log = opts.log ?? console.log;
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  let draining = false;

  const drain = (signal: string) => {
    if (draining) return; // a second signal must not double-close
    draining = true;
    log(`[control-plane] ${signal} received — draining (grace ${graceMs}ms)`);
    // Stop accepting new connections; finish what's in flight.
    server.close(() => {
      log("[control-plane] drained cleanly");
      exit(0);
    });
    // Keep-alive sockets with no active request would hold close() forever.
    server.closeIdleConnections();
    // Long-lived SSE streams never finish on their own — force after grace.
    const force = setTimeout(() => {
      log("[control-plane] grace elapsed with streams still open — exiting");
      exit(0);
    }, graceMs);
    force.unref?.();
  };

  process.on("SIGTERM", () => drain("SIGTERM"));
  process.on("SIGINT", () => drain("SIGINT"));
  return drain;
}
