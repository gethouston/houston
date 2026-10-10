import type { Server } from "node:http";
import { DEFAULT_SHUTDOWN_DRAIN_MS } from "../launcher/process-drain";
import {
  publishDrainStamp,
  retireDrainStamp,
} from "../store-sync/predecessor-drain";
import { createHostBase } from "./host-base";
import { createHostDaemons } from "./host-daemons";
import { createHostHeartbeat } from "./host-heartbeat";
import { createHostIntegrations } from "./host-integrations";
import { severityLog } from "./host-log";
import type { LocalHostOptions } from "./host-options";
import { createHostRuntime } from "./host-runtime";
import { createHostServer } from "./host-server";
import { startLocalHost } from "./host-start";

export { LOCAL_CAPABILITIES } from "../capabilities";
export { formatIntegrationsModeLog, LOCAL_USER } from "./host-log";
export type { LocalHostOptions } from "./host-options";

/** Headroom past the runtimes' own drain budget for their exit to land. */
const SHUTDOWN_EXIT_SLACK_MS = 5_000;
export interface LocalHost {
  server: Server;
  start(): Promise<void>;
  /** `drainMs` overrides the turn drain budget (a fenced pod's retire). */
  stop(stopOpts?: { drainMs?: number }): Promise<void>;
  /**
   * Another running engine owns the agent: stop firing routines locally and
   * stop the runtimes (a respawn would auto-resume turns that engine runs).
   */
  standDown(drainMs: number): Promise<void>;
}

/** The shared host server with local storage and a supervised runtime per agent. */
export function buildLocalHost(opts: LocalHostOptions): LocalHost {
  const base = createHostBase(opts);
  const runtime = createHostRuntime(opts, base);
  const integration = createHostIntegrations(opts, base.events);
  const heartbeat = createHostHeartbeat(opts, base, runtime);
  const serving = createHostServer(opts, base, runtime, integration, heartbeat);
  const daemons = createHostDaemons(opts, base, runtime);
  const state = {
    ...base,
    ...runtime,
    ...integration,
    ...heartbeat,
    ...serving,
    ...daemons,
  };
  const {
    server,
    scheduler,
    watcher,
    standingFrameCapture,
    frameForwarder,
    usageSampler,
    heartbeatDaemon,
    launcher,
    sharedMirror,
    syncDaemon,
  } = state;
  let stopPromise: Promise<void> | undefined;
  return {
    server,
    start: () => startLocalHost(opts, state),
    standDown: async (drainMs) => {
      scheduler.stop();
      heartbeatDaemon?.stop();
      await launcher.shutdownAllAndWait(drainMs);
    },
    stop(stopOpts) {
      if (stopPromise) return stopPromise;
      const drainMs = stopOpts?.drainMs ?? opts.shutdownDrainMs;
      stopPromise = (async () => {
        state.beginDrain();
        // PRODUCT-1783: on an eviction the replacement pod is created ~1s into
        // this drain. The stamp (flushed to the store immediately) is what
        // makes it wait instead of hydrating mid-turn and settling the turn
        // this pod is still running.
        if (syncDaemon) {
          await publishDrainStamp({
            rootDir: syncDaemon.rootDir,
            windowMs:
              (drainMs ?? DEFAULT_SHUTDOWN_DRAIN_MS) + SHUTDOWN_EXIT_SLACK_MS,
            flush: () => syncDaemon.flush(),
            log: severityLog,
          });
        }
        scheduler.stop();
        heartbeatDaemon?.stop();
        watcher.stop();
        // Drain the last accrued stretch before the runtimes go down; the
        // sampler swallows report failures, so this never blocks a shutdown.
        await usageSampler?.stop();
        // Await actual child exit (bounded): the final sync below must not
        // walk /data while a runtime is still flushing its last writes. The
        // runtimes drain their turns within the same budget (they get it as
        // HOUSTON_RUNTIME_DRAIN_MS); the extra beat here covers their exit.
        await launcher.shutdownAllAndWait(
          drainMs !== undefined ? drainMs + SHUTDOWN_EXIT_SLACK_MS : undefined,
        );
        // Only now: the standing capture pumps the frames of the turns the
        // runtimes just finished draining, and stopping it before the drain
        // would drop them (and their terminal frame) from the turn log.
        standingFrameCapture?.stop();
        await frameForwarder?.stop();
        await sharedMirror?.stop();
        // The drain is over: expire the stamp so the FINAL sync ships a closed
        // window and the next boot hydrates without waiting.
        if (syncDaemon) await retireDrainStamp(syncDaemon.rootDir, severityLog);
        await syncDaemon?.stop();
        await new Promise<void>((resolve, reject) => {
          if (!server.listening) return resolve();
          server.close((err) => (err ? reject(err) : resolve()));
        });
      })();
      return stopPromise;
    },
  };
}
