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
    // The installed agent-config library — the Rust engine's tree, carried over
    // so previously installed agents keep showing in the create-agent picker.
    agentConfigsDir:
      process.env.HOUSTON_AGENTS_DIR || join(houstonHome, "agents"),
    // The Rust-era chat-history db. Default to the canonical path; the migration
    // is a no-op when it is absent (a fresh install) or already done (marker).
    chatHistoryDbPath:
      process.env.HOUSTON_CHAT_HISTORY_DB ||
      join(houstonHome, "db", "houston.db"),
    port: Number(process.env.HOUSTON_HOST_PORT || 4318),
    // Loopback by default (desktop). Self-host sets HOUSTON_HOST_BIND=0.0.0.0.
    bind: process.env.HOUSTON_HOST_BIND || undefined,
    // Self-host opt-in for custom-integration OAuth (PRODUCT-1172): the public
    // origin the user's browser can reach (e.g. https://houston.example.com).
    // Desktop needs nothing — a loopback-bound local host derives its own.
    oauthCallbackBase: process.env.HOUSTON_OAUTH_CALLBACK_BASE_URL || undefined,
    token: hostToken,
    // Redact the token in the startup banner whenever it came from the
    // environment (a pod/self-host token an orchestrator already knows) or we are
    // a managed cloud pod — echoing it there just leaks a credential into
    // plaintext logs. The desktop sidecar mints a random per-boot token (no
    // HOUSTON_HOST_TOKEN) and its supervisor reads it back from this line, so
    // that case keeps the full token.
    redactBannerToken:
      !!hostTokenEnv || process.env.HOUSTON_MANAGED_CLOUD === "1",
    runtimeCommand: runtimeCommand(),
    // Managed pods pre-spawn their agent's runtime at boot so the ~10s runtime
    // start overlaps the pod wake instead of the user's first message.
    eagerRuntime: process.env.HOUSTON_EAGER_RUNTIME === "1",
    // The real Tauri app hands over its own product prompt; this is the built-in
    // default so the agent knows how to create Skills/Routines/learnings. The
    // Routines section advertises event wakes only where triggers can fire.
    systemPrompt:
      process.env.HOUSTON_APP_SYSTEM_PROMPT ||
      houstonSystemPrompt({ triggers: triggersEnabled }),
    capabilities:
      process.env.HOUSTON_MANAGED_CLOUD === "1"
        ? MANAGED_CLOUD_CAPABILITIES
        : LOCAL_CAPABILITIES,
    // A trigger backend exists only on managed cloud (see `triggersEnabled`).
    triggersEnabled,
    routineSchedulerMode,
    // The control plane's fire scheduler delivers scheduled instants (with the
    // creator's minted acting identity) only in the managed-cloud topology; the
    // pod-store env is its marker. Self-host has no control plane and must NOT
    // get the backstop grace this enables — its local cron is the only scheduler.
    externalRoutineFires: !!managedStore?.podGateway,
    // Managed pods sit behind the gateway (it enforces the pod token and mints
    // x-houston-acting-as); relay that header to the runtime so integration
    // calls act as the driving user. Only the `engine-pod` image target sets
    // HOUSTON_MANAGED_CLOUD; the `selfhost` target (FROM host-base) and desktop
    // never do, so they stay direct → false. The reserved-name refusal
    // (`routes/agent-name-reserved.ts`) relies on that: it is skipped when
    // gateway-fronted, so a self-host that set the env would lose it.
    gatewayFronted: process.env.HOUSTON_MANAGED_CLOUD === "1",
    // The org owner's canonical user id, stamped into managed pods by the
    // control plane, or on an AI Manager pod the manager's own person, whose
    // routines they all are. Backfills `created_by` on pre-rollout routines at
    // boot and backstops routine writes that carry no acting header — an
    // authorless routine is one the control-plane fire planner refuses to fire.
    ownerSub: managedOwnerSub(),
    // Dev launcher only (scripts/dev/control-plane.sh): its managed-cloud "pods"
    // are processes on the developer's machine, so their egress reaches loopback
    // and the public-HTTPS endpoint validation must not apply. Real pods never
    // set this — their NetworkPolicy is what the validation models.
    loopbackEgress: process.env.HOUSTON_LOOPBACK_EGRESS === "1",
    credentials: remoteGateway,
    sharedEndpoints: remoteGateway,
    // Active-time reporting rides the same managed-pod gateway quadruple: the
    // env being present IS the switch (desktop/self-host never set it).
    usageReporting: remoteGateway,
    // A pod's termination grace is what makes a drain worth anything; the
    // orchestrator that sets the grace sets this alongside it. The desktop
    // never does: its app is gone by the time the sidecar hears about it.
    shutdownDrainMs: shutdownDrainMs(),
    durableTurns,
    // Migration-source spawns (HOU-719): serve + migrate on boot, but never fire
    // routines or churn watch events while the cloud app reads the old tree.
    passive: process.env.HOUSTON_PASSIVE === "1",
    storeSync: managedStore?.storeSync,
    // A pod that lost its store lease stands down while a running engine owns
    // the agent, and restarts as its one writer once nobody does.
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
    // Platform-mode integrations: desktops get HOUSTON_INTEGRATIONS_URL (the
    // cloud gateway holding Houston's Composio key); self-host + the managed pod
    // set their own COMPOSIO_API_KEY and go direct. Neither → integrations off.
    integrations: {
      composioApiKey: process.env.COMPOSIO_API_KEY || undefined,
      gatewayUrl: process.env.HOUSTON_INTEGRATIONS_URL || undefined,
      // Managed pods run with a real HOUSTON_HOST_TOKEN (the gateway can recompute
      // it): pass it as the pod token so a routine turn authenticates as its
      // creator (C2). The desktop's token is a random per-boot secret, not a pod
      // token the gateway knows, so leave it unset there.
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
