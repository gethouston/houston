import { join } from "node:path";
import { managedOwnerSub } from "../assistant/manager-owner";
import {
  LOCAL_CAPABILITIES,
  MANAGED_CLOUD_CAPABILITIES,
} from "../capabilities";
import { houstonSystemPrompt } from "../houston-prompt";
import { respondToFenceLoss } from "./fence-retire";
import { buildLocalHost } from "./host";
import type { LocalHostOptions } from "./host-options";
import type { managedStoreConfig } from "./managed-store-config";
import { runtimeCommand } from "./runtime-command";

export function buildMainHost({
  houstonHome,
  hostTokenEnv,
  hostToken,
  remoteGateway,
  managedStore,
  durableTurns,
  triggersEnabled,
  routineSchedulerMode,
  flushReports,
}: {
  houstonHome: string;
  hostTokenEnv: string | undefined;
  hostToken: string;
  remoteGateway: LocalHostOptions["credentials"];
  managedStore: Awaited<ReturnType<typeof managedStoreConfig>>;
  durableTurns: LocalHostOptions["durableTurns"];
  triggersEnabled: boolean;
  routineSchedulerMode: LocalHostOptions["routineSchedulerMode"];
  flushReports: () => Promise<void>;
}) {
  const host = buildLocalHost({
    houstonHome,
    officeConvert: process.env.HOUSTON_OFFICE_CONVERT_URL
      ? {
          url: process.env.HOUSTON_OFFICE_CONVERT_URL,
          cacheDir: join(houstonHome, "cache", "office-previews"),
        }
      : undefined,
    workspacesRoot:
      process.env.HOUSTON_WORKSPACES_ROOT || join(houstonHome, "workspaces"),
    credentialsPath:
      process.env.HOUSTON_CREDENTIALS_PATH ||
      join(houstonHome, "credentials.json"),
    agentConfigsDir:
      process.env.HOUSTON_AGENTS_DIR || join(houstonHome, "agents"),
    chatHistoryDbPath:
      process.env.HOUSTON_CHAT_HISTORY_DB ||
      join(houstonHome, "db", "houston.db"),
    port: Number(process.env.HOUSTON_HOST_PORT || 4318),
    bind: process.env.HOUSTON_HOST_BIND || undefined,
    oauthCallbackBase: process.env.HOUSTON_OAUTH_CALLBACK_BASE_URL || undefined,
    token: hostToken,
    redactBannerToken:
      !!hostTokenEnv || process.env.HOUSTON_MANAGED_CLOUD === "1",
    runtimeCommand: runtimeCommand(),
    eagerRuntime: process.env.HOUSTON_EAGER_RUNTIME === "1",
    systemPrompt:
      process.env.HOUSTON_APP_SYSTEM_PROMPT ||
      houstonSystemPrompt({ triggers: triggersEnabled }),
    capabilities:
      process.env.HOUSTON_MANAGED_CLOUD === "1"
        ? MANAGED_CLOUD_CAPABILITIES
        : LOCAL_CAPABILITIES,
    triggersEnabled,
    routineSchedulerMode,
    externalRoutineFires: !!managedStore?.podGateway,
    gatewayFronted: process.env.HOUSTON_MANAGED_CLOUD === "1",
    ownerSub: managedOwnerSub(),
    loopbackEgress: process.env.HOUSTON_LOOPBACK_EGRESS === "1",
    credentials: remoteGateway,
    sharedEndpoints: remoteGateway,
    usageReporting: remoteGateway,
    shutdownDrainMs: shutdownDrainMs(),
    durableTurns,
    passive: process.env.HOUSTON_PASSIVE === "1",
    storeSync: managedStore?.storeSync,
    onStoreFenceLost: managedStore
      ? respondToFenceLoss({
          agent: `${managedStore.podGateway.orgSlug}/${managedStore.podGateway.agentSlug}`,
          stop: (stopOpts) => host.stop(stopOpts),
          standDown: (drainMs) => host.standDown(drainMs),
          exit: (code) => process.exit(code),
          flushReports,
        })
      : undefined,
    sharedMirror: managedStore?.sharedMirror,
    integrations: {
      composioApiKey: process.env.COMPOSIO_API_KEY || undefined,
      gatewayUrl: process.env.HOUSTON_INTEGRATIONS_URL || undefined,
      podToken: hostTokenEnv || undefined,
    },
    onRuntimeLog: (line) => process.stderr.write(line),
  });
  return host;
}

/** HOUSTON_SHUTDOWN_DRAIN_MS, parsed strictly: a garbled value must not
 *  silently become a multi-minute (or zero) drain. */
function shutdownDrainMs(): number | undefined {
  const raw = process.env.HOUSTON_SHUTDOWN_DRAIN_MS;
  if (!raw) return undefined;
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms < 0) {
    console.error(
      `[local-host] ignoring invalid HOUSTON_SHUTDOWN_DRAIN_MS=${JSON.stringify(raw)}`,
    );
    return undefined;
  }
  return ms;
}
