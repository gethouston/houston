import type { Server } from "node:http";
import { initEngineSentry } from "@houston/runtime-client/sentry";
import { config } from "./config";
import {
  installRuntimeLogging,
  loggerOptionsForMode,
} from "./observability/logging";
import { beginDrain } from "./session/drain";
import { drainTurnsThenExit } from "./session/graceful-shutdown";
import { turnsInFlight } from "./session/turn-inflight-count";
import {
  beginWorkerShutdown,
  type WorkerRegistration,
} from "./turn/worker-registration";

const sentry = initEngineSentry("runtime");
const { logger } = installRuntimeLogging({
  ...loggerOptionsForMode(config.mode, config.dataDir),
  capture: sentry?.captureLog,
});

let workerRegistration: WorkerRegistration | null = null;

async function start(): Promise<Server> {
  if (config.mode === "turn") {
    if (config.toolShell !== null) process.umask(0o002);
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
    const {
      assertMarkerWritable,
      markWorkerSpent,
      workerSpent,
      assertSingleUseIncarnationConfigured,
    } = await import("./turn/single-use");
    const explicitLocal =
      process.env.HOUSTON_CODE_EXECUTION?.trim().toLowerCase() === "local";
    if (explicitLocal && !config.poolSingleUse) {
      throw new Error(
        "HOUSTON_CODE_EXECUTION=local requires HOUSTON_POOL_SINGLE_USE=1 in turn mode: a multi-turn pool worker running in-container bash crosses tenant boundaries",
      );
    }
    if (config.codeExecution === "local" && !config.poolSingleUse) {
      logger.warn(
        "code execution defaulted to local without HOUSTON_POOL_SINGLE_USE=1 in turn mode: bash is DISABLED (a multi-turn pool worker crosses tenant boundaries). Set HOUSTON_CODE_EXECUTION=disabled to silence this.",
      );
    }
    if (config.poolSingleUse && turnConcurrency() !== 1) {
      throw new Error(
        "HOUSTON_POOL_SINGLE_USE=1 requires HOUSTON_TURN_CONCURRENCY=1: single-use means exactly one claimed turn per pod",
      );
    }
    assertSingleUseIncarnationConfigured(config.poolSingleUse, config.podUid);
    let spent = config.poolSingleUse && workerSpent();
    if (spent) {
      console.info(
        "[turn] pod is spent (single-use marker present); refusing to register until the pod is recycled",
      );
    }
    if (config.poolSingleUse && !spent) assertMarkerWritable();
    const registrationConfig = await loadWorkerRegistrationConfig();
    if (config.poolSingleUse) {
      const { installTurnNetworkMarks } = await import(
        "./turn/turn-network-marks"
      );
      installTurnNetworkMarks([
        process.env.HOUSTON_POOL_STORE_URL ?? "",
        process.env.HOUSTON_TURNLOG_URL ?? "",
      ]);
    }
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
      podUid: config.podUid,
      isDraining: () => spent || (workerRegistration?.draining ?? false),
      singleUse: config.poolSingleUse
        ? {
            begin: async () => {
              spent = true;
              markWorkerSpent();
            },
            settled: () => shutdown("single-use"),
          }
        : undefined,
    });
    await workerRegistration?.start();
    const { startClaudeWorkerBoot } = await import("./turn/claude-worker");
    startClaudeWorkerBoot({
      profile: config.poolSingleUse && !spent ? "single-use" : "multi-turn",
      root: config.dataDir,
      report: (error) =>
        logger.error("Claude Agent SDK worker boot task failed:", error),
    });
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
  await workerDrain;
  await workerRegistration?.stop();
  await logger.close();
  process.exit(0);
}

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  beginDrain();
  logger.info("runtime shutdown requested", { signal });
  workerDrain = beginWorkerShutdown(signal, workerRegistration);
  shadowDrain = drainTranscriptShadow();
  if (!workerRegistration) {
    drainTurnsThenExit({
      server,
      drainMs: config.shutdownDrainMs,
      turnsInFlight,
      exit: exitNow,
      log: logger,
    });
    return;
  }
  server.close(() => {
    void exitNow();
  });
  if (signal === "single-use") {
    setTimeout(() => {
      logger.warn("single-use shutdown exceeded deadline; forcing exit");
      void exitNow();
    }, 30_000).unref();
  }
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

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
