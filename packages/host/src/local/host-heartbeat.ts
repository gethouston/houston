import { HeartbeatDaemon } from "../heartbeat/daemon";
import { HeartbeatRunner } from "../heartbeat/runner";
import type { createHostBase } from "./host-base";
import { LOCAL_USER, severityLog } from "./host-log";
import type { LocalHostOptions } from "./host-options";
import type { createHostRuntime } from "./host-runtime";

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
