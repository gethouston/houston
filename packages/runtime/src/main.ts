import type { Server } from "node:http";
import { config } from "./config";
import { installRuntimeLogging } from "./observability/logging";

const { logger } = installRuntimeLogging({ dataDir: config.dataDir });

/**
 * Two modes, one binary:
 *  - server (default): the long-lived per-workspace runtime (desktop + legacy
 *    GKE pods) — full HTTP surface, in-memory event bus.
 *  - turn: the stateless per-turn cloud runtime — POST /turn only, one
 *    hydrate→run→sync cycle per request. Selected with HOUSTON_MODE=turn.
 */
async function start(): Promise<Server> {
  if (config.mode === "turn") {
    const { createTurnServer } = await import("./turn/server");
    const { GcsStore } = await import("./turn/gcs-store");
    const { LocalDirStore } = await import("./turn/object-store");
    if (!config.gcsBucket && !config.localStoreDir) {
      throw new Error(
        "turn mode needs HOUSTON_GCS_BUCKET (prod) or HOUSTON_LOCAL_STORE_DIR (dev)",
      );
    }
    const store = config.gcsBucket
      ? new GcsStore(config.gcsBucket)
      : new LocalDirStore(config.localStoreDir);
    const server = createTurnServer({ store, token: config.turnToken });
    server.listen(config.port, config.host, () => {
      console.info("runtime listening", {
        auth: config.turnToken ? "x_internal_token_required" : "open_local_dev",
        mode: "turn",
        store: config.gcsBucket
          ? `gs://${config.gcsBucket}`
          : config.localStoreDir,
        url: `http://${config.host}:${config.port}`,
      });
    });
    return server;
  }
  // Swap Claude's loopback OAuth for the headless copy-paste flow when remote.
  if (config.headless) {
    const { registerHeadlessAnthropicProvider } = await import(
      "./auth/anthropic-headless"
    );
    registerHeadlessAnthropicProvider();
  }
  const { startServer } = await import("./transport/server");
  return startServer();
}

const server = await start();

let shuttingDown = false;

async function exitNow() {
  await logger.close();
  process.exit(0);
}

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("runtime shutdown requested", { signal });
  server.close(() => {
    void exitNow();
  });
  setTimeout(() => {
    void exitNow();
  }, 3000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
