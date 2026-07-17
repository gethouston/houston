import type { Server } from "node:http";
import { initEngineSentry } from "@houston/runtime-client/sentry";
import { config } from "./config";
import { installRuntimeLogging } from "./observability/logging";

// Crash reporting (dormant without SENTRY_DSN — inherited from the host that
// spawned us: the desktop app's injection or the engine-pod image env). Wired
// as the logger's capture feed, NOT a console wrap — installRuntimeLogging
// already owns console, so this sees every logged error exactly once.
const sentry = initEngineSentry("runtime");
const { logger } = installRuntimeLogging({
  dataDir: config.dataDir,
  // The method reference, NOT a local arrow: a wrapper defined here would put
  // a main.ts frame at the top of every synthetic stack, where the reporter's
  // frame-trimming (which keys on the sentry/logging filenames) can't reach it.
  capture: sentry?.captureLog,
});

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
    const { LocalDirStore } = await import(
      "@houston/runtime-client/object-sync"
    );
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

// A runtime crash must still crash (the host's launcher reaps the exit and
// respawns on next touch) — but it must reach Sentry AND stderr first.
// Registering these handlers replaces Node's fatal default, so re-create it:
// print the stack to stderr (the host forwards our stderr into its logs),
// log it (file + Sentry via the capture feed), flush, exit non-zero.
let fatalExiting = false;
function fatalCrash(kind: string, err: unknown) {
  const stack = err instanceof Error ? (err.stack ?? String(err)) : String(err);
  process.stderr.write(`runtime ${kind}: ${stack}\n`);
  logger.error(`runtime ${kind}:`, err);
  if (fatalExiting) return;
  fatalExiting = true;
  void (async () => {
    await sentry?.flush();
    await logger.close();
    process.exit(1);
  })();
}
process.on("uncaughtException", (err) => fatalCrash("uncaughtException", err));
process.on("unhandledRejection", (reason) =>
  fatalCrash("unhandledRejection", reason),
);
