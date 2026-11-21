import type { Server } from "node:http";

export interface ShutdownOptions {
  graceMs?: number;
  log?: (message: string) => void;
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
    if (draining) return;
    draining = true;
    log(`[control-plane] ${signal} received — draining (grace ${graceMs}ms)`);
    server.close(() => {
      log("[control-plane] drained cleanly");
      exit(0);
    });
    server.closeIdleConnections();
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
