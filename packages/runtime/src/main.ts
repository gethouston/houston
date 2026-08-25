import type { Server } from "node:http";
import { initEngineSentry } from "@houston/runtime-client/sentry";
import { config } from "./config";
import { installRuntimeLogging } from "./observability/logging";
import {
  beginWorkerShutdown,
  type WorkerRegistration,
} from "./turn/worker-registration";

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
let workerRegistration: WorkerRegistration | null = null;

async function start(): Promise<Server> {
  if (config.mode === "turn") {
    const { AdmissionLimiter, turnConcurrency } = await import(
      "./turn/admission"
    );
    const { createTurnServer } = await import("./turn/server");
    const { GcsStore } = await import("./turn/gcs-store");
    const { poolOnlyFallbackStore } = await import("./turn/turn-store");
    const { WorkerRegistration: Registration } = await import(
      "./turn/worker-registration"
    );
    const { loadWorkerRegistrationConfig, turnServerToken } = await import(
      "./turn/worker-registration-config"
    );
    const { LocalDirStore } = await import(
      "@houston/runtime-client/object-sync"
    );
    if (
      !config.gcsBucket &&
      !config.localStoreDir &&
      !process.env.HOUSTON_POOL_STORE_URL
    ) {
      throw new Error(
        "turn mode needs HOUSTON_GCS_BUCKET, HOUSTON_LOCAL_STORE_DIR, or HOUSTON_POOL_STORE_URL",
      );
    }
    const store = config.gcsBucket
      ? new GcsStore(config.gcsBucket)
      : config.localStoreDir
        ? new LocalDirStore(config.localStoreDir)
        : poolOnlyFallbackStore();
    const { markWorkerSpent, workerSpent } = await import("./turn/single-use");
    // local bash on a turn worker is only safe when the pod serves exactly one
    // claimed turn and is then replaced; fail closed like the rest of the
    // exec-mode parsing (config.ts) rather than silently degrading.
    if (config.codeExecution === "local" && !config.poolSingleUse) {
      throw new Error(
        "HOUSTON_CODE_EXECUTION=local in turn mode requires HOUSTON_POOL_SINGLE_USE=1: a multi-turn pool worker crosses tenant boundaries",
      );
    }
    if (config.poolSingleUse && turnConcurrency() !== 1) {
      throw new Error(
        "HOUSTON_POOL_SINGLE_USE=1 requires HOUSTON_TURN_CONCURRENCY=1: single-use means exactly one claimed turn per pod",
      );
    }
    // A restarted container in a spent pod (single-use worker exited, kubelet
    // restarted it in place) must idle unregistered until the control plane
    // replaces the pod — never serve from a tree the previous tenant's code
    // may have touched.
    let spent = config.poolSingleUse && workerSpent();
    if (spent) {
      console.error(
        "[turn] pod is spent (single-use marker present); refusing to register until the pod is recycled",
      );
    }
    const registrationConfig = await loadWorkerRegistrationConfig();
    const admission = new AdmissionLimiter(turnConcurrency());
    workerRegistration =
      registrationConfig && !spent
        ? new Registration(registrationConfig, admission)
        : null;
    const token = turnServerToken(config.turnToken, registrationConfig);
    const server = createTurnServer({
      store,
      token,
      admission,
      isDraining: () => spent || (workerRegistration?.draining ?? false),
      singleUse: config.poolSingleUse
        ? {
            begin: async () => {
              spent = true;
              await markWorkerSpent();
            },
            settled: () => shutdown("single-use"),
          }
        : undefined,
    });
    await workerRegistration?.start();
    try {
      await new Promise<void>((resolve, reject) => {
        const failed = (error: Error) => reject(error);
        server.once("error", failed);
        server.listen(config.port, config.host, () => {
          server.off("error", failed);
          resolve();
        });
      });
    } catch (error) {
      await workerRegistration?.stop();
      throw error;
    }
    console.info("runtime listening", {
      auth: token ? "x_internal_token_required" : "open_local_dev",
      mode: "turn",
      store: config.gcsBucket
        ? `gs://${config.gcsBucket}`
        : config.localStoreDir,
      url: `http://${config.host}:${config.port}`,
    });
    return server;
  }
  const { startServer } = await import("./transport/server");
  return startServer();
}

const server = await start();

let shuttingDown = false;
let shadowDrain: Promise<void> = Promise.resolve();
let workerDrain: Promise<void> = Promise.resolve();

// Bounded, best-effort: a scale-to-zero right after a file mutation must give
// the transcript shadow queue a chance to reach the gateway (its pending sends
// and dirty markers are in-memory only), but may never hold the process past
// the shutdown cap below. Turn mode has no long-lived store — importing it
// there would only create an unused conversations dir.
async function drainTranscriptShadow(): Promise<void> {
  if (config.mode === "turn") return;
  try {
    const { drainTranscriptShadowForShutdown } = await import(
      "./store/conversations"
    );
    await drainTranscriptShadowForShutdown(2_000);
  } catch (error) {
    logger.error("transcript shadow shutdown drain failed:", error);
  }
}

async function exitNow() {
  await shadowDrain;
  // Order matters: the draining heartbeat must land BEFORE registration
  // stops, or stop() aborts the very request that tells the gateway to route
  // elsewhere and the registry keeps advertising a dead worker for a minute.
  await workerDrain;
  await workerRegistration?.stop();
  await logger.close();
  process.exit(0);
}

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("runtime shutdown requested", { signal });
  workerDrain = beginWorkerShutdown(signal, workerRegistration);
  shadowDrain = drainTranscriptShadow();
  server.close(() => {
    void exitNow();
  });
  // A registered pool worker keeps serving its in-flight turn until the
  // response ends (sync-back + terminal frame); the pod's termination grace is
  // the hard deadline there. Every other runtime keeps the short forced exit.
  if (!workerRegistration) {
    setTimeout(() => {
      void exitNow();
    }, 3000).unref();
  }
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
