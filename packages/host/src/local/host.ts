import type { Server } from "node:http";
import { createHostBase } from "./host-base";
import { createHostDaemons } from "./host-daemons";
import { createHostIntegrations } from "./host-integrations";
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
  stop(): Promise<void>;
}

/** The shared host server with local storage and a supervised runtime per agent. */
export function buildLocalHost(opts: LocalHostOptions): LocalHost {
  const base = createHostBase(opts);
  const runtime = createHostRuntime(opts, base);
  const integration = createHostIntegrations(opts, base.events);
  const serving = createHostServer(opts, base, runtime, integration);
  const daemons = createHostDaemons(opts, base, runtime);
  const state = { ...base, ...runtime, ...integration, ...serving, ...daemons };
  const {
    server,
    scheduler,
    watcher,
    standingFrameCapture,
    frameForwarder,
    usageSampler,
    launcher,
    sharedMirror,
    syncDaemon,
  } = state;
  let stopPromise: Promise<void> | undefined;
  return {
    server,
    start: () => startLocalHost(opts, state),
    stop() {
      if (stopPromise) return stopPromise;
      stopPromise = (async () => {
        state.beginDrain();
        scheduler.stop();
        watcher.stop();
        // Drain the last accrued stretch before the runtimes go down; the
        // sampler swallows report failures, so this never blocks a shutdown.
        await usageSampler?.stop();
        // Await actual child exit (bounded): the final sync below must not
        // walk /data while a runtime is still flushing its last writes. The
        // runtimes drain their turns within the same budget (they get it as
        // HOUSTON_RUNTIME_DRAIN_MS); the extra beat here covers their exit.
        await launcher.shutdownAllAndWait(
          opts.shutdownDrainMs !== undefined
            ? opts.shutdownDrainMs + SHUTDOWN_EXIT_SLACK_MS
            : undefined,
        );
        // Only now: the standing capture pumps the frames of the turns the
        // runtimes just finished draining, and stopping it before the drain
        // would drop them (and their terminal frame) from the turn log.
        standingFrameCapture?.stop();
        await frameForwarder?.stop();
        await sharedMirror?.stop();
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
