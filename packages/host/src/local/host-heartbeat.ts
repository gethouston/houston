import { HeartbeatDaemon } from "../heartbeat/daemon";
import { HeartbeatRunner } from "../heartbeat/runner";
import type { createHostBase } from "./host-base";
import { LOCAL_USER, severityLog } from "./host-log";
import type { LocalHostOptions } from "./host-options";
import type { createHostRuntime } from "./host-runtime";

/**
 * The AI Manager's morning briefing, for the open host (desktop, self-host).
 * A gateway-fronted pod gets none: the gateway owns the manager there, and a
 * daemon inside one pod would brief from a partial view (a gateway follow-up).
 * The daemon starts beside the routine scheduler (host-start.ts) and stops
 * with it.
 */
export function createHostHeartbeat(
  opts: LocalHostOptions,
  base: ReturnType<typeof createHostBase>,
  runtime: ReturnType<typeof createHostRuntime>,
) {
  if (opts.gatewayFronted)
    return { heartbeatRunner: undefined, heartbeatDaemon: undefined };
  const { store, vfs, paths, bus, events } = base;
  const heartbeatRunner = new HeartbeatRunner({
    store,
    vfs,
    paths,
    lock: bus,
    channel: runtime.channel,
    events,
    // The same carve-out discovery uses: the manager's directory exists before
    // its first turn even if the person never opened the chat.
    ensureAgentDir: (agentId) => {
      runtime.liveAgentDir(agentId);
    },
    userId: LOCAL_USER,
    log: severityLog,
  });
  return {
    heartbeatRunner,
    heartbeatDaemon: new HeartbeatDaemon(heartbeatRunner, severityLog),
  };
}
