import { loadRoutineRuns } from "@houston/domain";
import type { ChannelCtx } from "../ports";
import { ChannelRoutineFirer } from "../schedule/firer";
import { EXTERNAL_FIRE_GRACE_MS, Scheduler } from "../schedule/scheduler";
import { UsageSampler } from "../usage/sampler";
import { FsWatcher } from "../watch/watcher";
import type { createHostBase } from "./host-base";
import { LOCAL_USER, severityLog } from "./host-log";
import type { LocalHostOptions } from "./host-options";
import type { createHostRuntime } from "./host-runtime";

export function createHostDaemons(
  opts: LocalHostOptions,
  base: ReturnType<typeof createHostBase>,
  runtime: ReturnType<typeof createHostRuntime>,
) {
  const {
    store,
    vfs,
    paths,
    bus,
    events,
    docProjector,
    roleTracker,
    transcriptShadow,
  } = base;
  const { channel } = runtime;
  const watcher = new FsWatcher(opts.workspacesRoot, (event) => {
    events.emit(LOCAL_USER, event);
    docProjector?.onEvent(event);
    roleTracker.onEvent(event);
  });
  const scheduler = new Scheduler({
    store,
    vfs,
    paths,
    lock: bus,
    firer: new ChannelRoutineFirer({ local: channel }),
    events,
    replyReader: transcriptShadow,
    mode: opts.routineSchedulerMode ?? "local",
    dedupTtlSec: opts.gatewayFronted ? 86_400 : 3600,
    cronFireGraceMs: opts.externalRoutineFires ? EXTERNAL_FIRE_GRACE_MS : 0,
  });
  const usageSampler = opts.usageReporting
    ? new UsageSampler({
        report: opts.usageReporting,
        listAgents: async () => {
          const out: ChannelCtx[] = [];
          for (const ws of await store.listWorkspaces()) {
            for (const agent of await store.listAgents(ws.id)) {
              out.push({ workspace: ws, agent });
            }
          }
          return out;
        },
        turnBusy: (ctx) => channel.busy(ctx),
        runningRoutineRuns: async (ctx) => {
          const runs = await loadRoutineRuns(
            vfs,
            paths.agentRoot(ctx.workspace, ctx.agent),
          );
          return runs.items
            .filter((run) => run.status === "running")
            .map((run) => run.id);
        },
        log: severityLog,
      })
    : undefined;

  return { watcher, scheduler, usageSampler };
}
