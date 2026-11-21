import { existsSync } from "node:fs";
import { basename, dirname } from "node:path";
import { SingleUserVerifier } from "../auth/verify";
import { refreshViewsOnEvents } from "../docs/view-warm";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { createModelCallForwarder } from "../telemetry/model-call-report";
import { createPushReporter } from "../telemetry/push-report";
import { createOfficePreview } from "../turn/files-office";
import { httpOfficeConverter } from "../turn/office-converter";
import { FsVfs } from "../vfs";
import type { createHostBase } from "./host-base";
import { servedCapabilities } from "./host-capabilities";
import type { createHostHeartbeat } from "./host-heartbeat";
import type { createHostIntegrations } from "./host-integrations";
import { LOCAL_USER } from "./host-log";
import type { LocalHostOptions } from "./host-options";
import type { createHostRuntime } from "./host-runtime";
import { createViewSink } from "./view-sink";

export function createHostServer(
  opts: LocalHostOptions,
  base: ReturnType<typeof createHostBase>,
  runtime: ReturnType<typeof createHostRuntime>,
  integration: ReturnType<typeof createHostIntegrations>,
  heartbeat: ReturnType<typeof createHostHeartbeat>,
) {
  const {
    store,
    vfs,
    paths,
    bus,
    boot,
    events,
    vault,
    credentials,
    sharedEndpoints,
    assistantGateway,
    assistantUnserved,
    transcriptShadow,
    docShadow,
    docProjector,
    roleTracker,
  } = base;
  const { channel, credentialHealer, agentDir, liveAgentDir } = runtime;
  const { integrations, customIntegrations } = integration;
  const chatHistoryMigrated = !!(
    opts.chatHistoryDbPath && existsSync(opts.chatHistoryDbPath)
  );

  const agentConfigs = opts.agentConfigsDir
    ? {
        vfs: new FsVfs(dirname(opts.agentConfigsDir)),
        root: () => basename(opts.agentConfigsDir as string),
      }
    : undefined;

  const capabilities = servedCapabilities(opts, integration, heartbeat);
  const syncDaemon = base.syncDaemon;
  const deps: ControlPlaneDeps = {
    uploadSessions: base.uploadSessions,
    verifier: new SingleUserVerifier({ token: opts.token, userId: LOCAL_USER }),
    store,
    credentials,
    credentialHealer,
    sharedEndpoints,
    vault,
    vfs,
    paths,
    events,
    channels: { local: channel },
    capabilities,
    officePreview: opts.officeConvert
      ? createOfficePreview(
          opts.officeConvert.cacheDir,
          httpOfficeConverter(opts.officeConvert.url),
        )
      : undefined,
    chatHistoryMigrated,
    integrations,
    customIntegrations,
    triggerLock: bus,
    routineFireLock: bus,
    routineFireDedupTtlSec: opts.gatewayFronted ? 86_400 : 3600,
    transcriptShadow,
    agentConfigs,
    gatewayFronted: opts.gatewayFronted ?? false,
    ownerSub: opts.ownerSub,
    triggersEnabled: opts.triggersEnabled ?? false,
    loopbackEgress: opts.loopbackEgress ?? false,
    agentDir: (_ws, a) => agentDir(a.id),
    ensureSyntheticAgentDir: (agentId) => {
      liveAgentDir(agentId);
    },
    heartbeat: heartbeat.heartbeatRunner,
    assistantGateway: () => assistantGateway,
    unservedOperations: () => assistantUnserved,
    corsOrigin: "*",
    metrics: { render: () => boot.render(), contentType: boot.contentType },
    modelCallReports: opts.usageReporting
      ? createModelCallForwarder({ report: opts.usageReporting })
      : undefined,
    pushReports: opts.usageReporting
      ? createPushReporter({ report: opts.usageReporting })
      : undefined,
    storeFenced: syncDaemon ? () => syncDaemon.fenced : undefined,
    storeWritable: syncDaemon ? () => syncDaemon.writable() : undefined,
    storeSyncAfterWrite: syncDaemon
      ? () => syncDaemon.syncAfterWrite()
      : undefined,
    storeSyncFlush: syncDaemon ? () => syncDaemon.flush() : undefined,
    addressedAgent: docProjector
      ? (agentId) => {
          docProjector.bindAddressed(agentId);
          roleTracker.ensureTracked(agentId);
        }
      : undefined,
    viewSink:
      docShadow && docProjector
        ? createViewSink(docShadow, docProjector)
        : undefined,
  };

  const server = createControlPlaneServer(deps);
  if (docShadow) {
    refreshViewsOnEvents({
      port: opts.port,
      token: opts.token,
      store,
      events,
      userId: LOCAL_USER,
    });
  }

  return { server, syncDaemon };
}
