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

const SHUTDOWN_EXIT_SLACK_MS = 5_000;
export interface LocalHost {
  server: Server;
  start(): Promise<void>;
  stop(stopOpts?: { drainMs?: number }): Promise<void>;
  standDown(drainMs: number): Promise<void>;
}

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
        await usageSampler?.stop();
        await launcher.shutdownAllAndWait(
          drainMs !== undefined ? drainMs + SHUTDOWN_EXIT_SLACK_MS : undefined,
        );
        standingFrameCapture?.stop();
        await frameForwarder?.stop();
        await sharedMirror?.stop();
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
