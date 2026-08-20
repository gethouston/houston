import { existsSync, mkdirSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { basename, dirname, join } from "node:path";
import { loadRoutineRuns, sharedSkillsDirKey } from "@houston/domain";
import type { Capabilities } from "@houston/protocol";
import type {
  ManifestObjectStore,
  ObjectStore,
} from "@houston/runtime-client/object-sync";
import { SingleUserVerifier } from "../auth/verify";
import { LOCAL_CAPABILITIES } from "../capabilities";
import { captureRuntimeCredential } from "../channel/capture-credential";
import { ProxyChannel } from "../channel/proxy";
import { FileCredentialStore } from "../credentials/file-store";
import { RemoteSharedEndpointStore } from "../credentials/remote-shared-endpoint-store";
import { RemoteCredentialStore } from "../credentials/remote-store";
import { EnvCredentialVault } from "../credentials/vault";
import { HttpDocShadow } from "../docs/http-shadow";
import { DocShadowProjector } from "../docs/projector";
import { warmViewDocs } from "../docs/view-warm";
import { BusEventHub } from "../events/hub";
import { ComposioProvider } from "../integrations/composio";
import { CustomExecutorHost } from "../integrations/custom/executor-host";
import { CustomIntegrationManager } from "../integrations/custom/manager";
import { CustomIntegrationProvider } from "../integrations/custom/provider";
import {
  FileCustomSecretStore,
  RemoteCustomSecretStore,
} from "../integrations/custom/secrets";
import { FileCustomIntegrationStore } from "../integrations/custom/store";
import { IntegrationRegistry } from "../integrations/registry";
import { RemoteIntegrationProvider } from "../integrations/remote";
import { ProcessLauncher, type RuntimeSpawner } from "../launcher/process";
import { RuntimeProcessSpawner } from "../launcher/runtime-spawner";
import { migrateAgentLayouts } from "../migrate/agent-layout";
import { reseedAgentSchemas } from "../migrate/agent-schemas";
import { migrateChatHistory } from "../migrate/chat-history";
import { LocalPaths } from "../paths";
import type { PodGatewayConfig } from "../pod-gateway";
import type { ChannelCtx } from "../ports";
import { forward } from "../proxy/route";
import { CredentialServeHealer } from "../routes/credential-healer";
import { CUSTOM_OAUTH_CALLBACK_PATH } from "../routes/custom-integrations-oauth";
import { ChannelRoutineFirer } from "../schedule/firer";
import { type RoutineSchedulerMode, Scheduler } from "../schedule/scheduler";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { syncSharedEndpoint } from "../shared-endpoint/sync";
import { LocalWorkspaceStore } from "../store/local";
import { SharedMirrorController, StoreSyncDaemon } from "../store-sync";
import { BootTelemetry } from "../telemetry/boot";
import { sendBootReport } from "../telemetry/boot-report";
import { HttpTranscriptShadow } from "../transcripts/http-shadow";
import { MemoryTurnBus } from "../turn/bus";
import { FrameForwarder } from "../turn/frame-forwarder";
import { StandingFrameCapture } from "../turn/standing-frame-capture";
import { HttpTurnLogSender } from "../turn/turn-log-http";
import { UsageSampler } from "../usage/sampler";
import { FsVfs } from "../vfs";
import { FsWatcher } from "../watch/watcher";
import { agentDirFor, liveAgentDirFor } from "./agent-dirs";
import { formatHostListeningBanner } from "./banner";

/** The single local user every request resolves to. */
export const LOCAL_USER = "local-owner";

// Re-exported so existing importers (`./host`) and the Tauri sidecar keep one
// import site; the constant itself now lives in ../capabilities (shared with
// the cloud profile + the dual-profile parity gate).
export { LOCAL_CAPABILITIES };

export interface LocalHostOptions {
  /** `~/.houston/workspaces` — the desktop tree (FsVfs root + store root). */
  workspacesRoot: string;
  /** Where the connect-once credential file lives (e.g. `~/.houston/credentials.json`). */
  credentialsPath: string;
  /**
   * `~/.houston/agents` — the installed agent-config library (the same tree the
   * Rust engine wrote, so previously installed configs carry over). Omit to run
   * without a library (list reads empty, installs answer 503).
   */
  agentConfigsDir?: string;
  /** Loopback port; the Tauri shell reads it from the startup banner. */
  port: number;
  /**
   * Interface to bind. Defaults to `127.0.0.1` — the desktop sidecar must stay
   * loopback-only so nothing on the network can drive the user's agents. The
   * self-host deployment (a single-user VPS behind a TLS reverse proxy) sets
   * this to `0.0.0.0` via HOUSTON_HOST_BIND; the boot token still gates every
   * request, so exposing the port is safe only WITH that token + TLS in front.
   */
  bind?: string;
  /** Random per-boot token the shell presents on every request (SingleUserVerifier). */
  token: string;
  /**
   * Redact the token in the `HOUSTON_HOST_LISTENING` startup banner to a short
   * fingerprint instead of printing it in full. Set when the token was supplied
   * by an orchestrator (env `HOUSTON_HOST_TOKEN`) or in managed cloud — where the
   * banner would otherwise leak the credential into plaintext pod logs and no one
   * reads it back. Left false for the desktop sidecar, whose supervisor parses the
   * per-boot token out of this line (`engine_supervisor.rs::parse_banner`).
   */
  redactBannerToken?: boolean;
  /** argv to launch a pi-runtime: dev `node --import tsx .../runtime/src/main.ts`, prod the sidecar. */
  runtimeCommand: string[];
  /** Product system prompt the app injects into every runtime (voice rules). */
  systemPrompt?: string;
  /** Per-runtime log sink (the app's logs). */
  onRuntimeLog?: (line: string) => void;
  /** Test seam: a fake spawner so the wiring is exercisable without real processes. */
  spawner?: RuntimeSpawner;
  /**
   * Spawn every stored agent's runtime right after listen instead of on its
   * first dispatch (managed pods set HOUSTON_EAGER_RUNTIME=1). A woken pod's
   * runtime boot (~10s — mostly loading the provider SDKs) then overlaps the
   * wake's volume-attach/readiness window instead of taxing the user's first
   * message. Leave off for the desktop: spawning every agent's runtime at app
   * start would burn laptop RAM/CPU on agents that may never be opened.
   */
  eagerRuntime?: boolean;
  /**
   * Path to the Rust-era chat-history db (`~/.houston/db/houston.db`). When set
   * AND the file exists, the host runs the one-time chat-history migration on
   * boot (idempotent, additive — see migrate/chat-history.ts). Omit (or point at
   * a missing path) to skip migration entirely. This is the LIVE db; the
   * migration opens it read-only and never writes it, but it must be a path that
   * is safe to read while the app may hold a WAL lock on the original.
   */
  chatHistoryDbPath?: string;
  /** Override served capabilities; managed K8s pods use the cloud profile. */
  capabilities?: ControlPlaneDeps["capabilities"];
  /**
   * Browser-reachable base URL for the custom-integration OAuth callback
   * (PRODUCT-1172), e.g. a self-host's public origin
   * (HOUSTON_OAUTH_CALLBACK_BASE_URL). Unset: a loopback-bound local host
   * derives `http://127.0.0.1:<port>` (the desktop sidecar — the user's
   * browser runs on the same machine); every other shape (managed pods,
   * 0.0.0.0 binds with no configured origin) serves NO callback and the
   * capability stays off.
   */
  oauthCallbackBase?: string;
  /**
   * Managed pod credential gateway. When present, provider credentials live at
   * the org level in the gateway (single refresher); the local file is only a
   * one-time adoption fallback for pods that already captured a legacy credential.
   */
  credentials?: {
    url: string;
    orgSlug: string;
    agentSlug: string;
    podToken: string;
  };
  /** Managed-pod organization endpoint gateway. Absent on desktop/self-host. */
  sharedEndpoints?: {
    url: string;
    orgSlug: string;
    agentSlug: string;
    podToken: string;
  };
  /**
   * Integration wiring (platform model):
   *  - `gatewayUrl`: Houston's cloud host; the desktop forwards with the user's
   *    Supabase session, so no provider key ever lives on this machine.
   *  - `composioApiKey`: a DIRECT platform key — self-host/dev only, where the
   *    operator owns the key. Never ship a shared key to end-user desktops.
   * Both set → the gateway wins. Neither → integrations off (empty capability
   * list, routes 503).
   *
   * `podToken` (managed pods only, env `HOUSTON_HOST_TOKEN`) lets the gateway
   * adapter authenticate a routine turn as its creator (C2, auth mode b). Absent
   * on the desktop — a routine turn there has no way to act as the creator, so it
   * falls through to signin-required.
   */
  integrations?: {
    gatewayUrl?: string;
    composioApiKey?: string;
    podToken?: string;
  };
  /**
   * Passive mode (env `HOUSTON_PASSIVE=1`): boot migrations + serve, but keep
   * the scheduler and the FS watcher OFF. The one-click migration (HOU-719)
   * spawns this host briefly against the old `~/.houston` purely to convert
   * and read data — a read-only source must never fire routines (spawning
   * credential-less runtimes) or churn watch events while the cloud app copies.
   */
  passive?: boolean;
  /** Cron ownership. `external` keeps reconcile alive but skips local fires. */
  routineSchedulerMode?: RoutineSchedulerMode;
  /**
   * True only when a trusted gateway fronts EVERY request to this host (the
   * managed cloud pod: the gateway enforces the pod token and mints/strips
   * `x-houston-acting-as` itself). Relays that header to the runtime so a
   * turn's integration calls authenticate as the driving user (C2). On the
   * desktop clients reach this host directly, so an inbound acting header is
   * untrusted client input — leave this false (the default) and it is dropped.
   */
  gatewayFronted?: boolean;
  /**
   * Whether this deployment can fire event-driven routines: a trigger backend
   * (a Composio project key + a public webhook URL) exists, so a routine's
   * `trigger` binding can actually wake. True on Houston Cloud only; false
   * (default) on desktop and self-host, which carry no trigger backend. Drives
   * the routine write gate and the trigger-status route (and the product prompt,
   * built in local/main.ts). Distinct from the CLIENT-facing
   * `capabilities.triggers`, advertised by the managed gateway at its edge.
   */
  triggersEnabled?: boolean;
  /** Gateway-fronted but the egress still reaches loopback (dev launcher
   *  only): skips the managed-cloud public-HTTPS endpoint validation. */
  loopbackEgress?: boolean;
  /** Managed-pod cache persistence. Omit to preserve the local/PVC lifecycle. */
  storeSync?: {
    store: ObjectStore;
    quietMs?: number;
    intervalMs?: number;
    maxHydrateBytes?: number;
    /** Gateway's explicit generation-precondition capability (boot lease). */
    generations?: boolean;
  };
  /** Managed-pod read/write org prefix mirror, outside the agent workspace. */
  sharedMirror?: {
    store: ManifestObjectStore;
    mirrorDir: string;
    /** Gateway's explicit generation-precondition capability (boot lease). */
    generations?: boolean;
  };
  /**
   * Managed-pod active-time reporting: sample this pod's busy state and report
   * per-day totals to the gateway's compute-usage ingest. Same env quadruple as
   * `credentials` — absent on desktop/self-host, where no sampler ever runs.
   */
  usageReporting?: {
    url: string;
    orgSlug: string;
    agentSlug: string;
    podToken: string;
  };
  /** Managed durable-turn shadows. Both switches are explicit rollout caps. */
  durableTurns?: {
    gateway: PodGatewayConfig;
    /**
     * Turnlog ingest lives on the GATEWAY (it owns the Redis streams), not on
     * the pod store `gateway` points at — batches sent there 404. Absent =
     * fall back to `gateway` for old control planes that predate
     * HOUSTON_TURNLOG_URL; the sender's failure path already tolerates it.
     */
    turnlogGateway?: PodGatewayConfig;
    transcriptDualWrite: boolean;
    turnLog: boolean;
  };
}

export interface LocalHost {
  server: Server;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Log callback for the background daemons (store-sync, usage sampler): an
 * entry WITH an error is a failure → stderr, which the Sentry console capture
 * turns into an error event; an entry without one is operational logging →
 * info, a breadcrumb. Routing everything through console.error (the old shape)
 * made every "[store-sync] hydrated N objects" boot line a Sentry error issue.
 */
function severityLog(message: string, err?: unknown): void {
  if (err === undefined) console.info(message);
  else console.error(message, err);
}

export function formatIntegrationsModeLog(
  integrations: LocalHostOptions["integrations"],
): string {
  if (integrations?.gatewayUrl) {
    return `[local-host] integrations: gateway ${integrations.gatewayUrl}`;
  }
  if (integrations?.composioApiKey) {
    return "[local-host] integrations: direct (own Composio key)";
  }
  return "[local-host] integrations off: set HOUSTON_INTEGRATIONS_URL or COMPOSIO_API_KEY to enable";
}

/**
 * The local supervisor: the SAME host server (createControlPlaneServer) wired
 * with the local adapter profile — the desktop's "control plane shrunk to one
 * machine and one tenant". Reuses every shared route handler; only the
 * deployment seams differ (LocalWorkspaceStore, FsVfs, LocalPaths,
 * SingleUserVerifier, ProxyChannel over a ProcessLauncher, FsWatcher → events).
 */
export function buildLocalHost(opts: LocalHostOptions): LocalHost {
  const store = new LocalWorkspaceStore(opts.workspacesRoot, LOCAL_USER);
  const vfs = new FsVfs(opts.workspacesRoot);
  const paths = new LocalPaths();
  const bus = new MemoryTurnBus();
  const boot = new BootTelemetry();
  const events = new BusEventHub(bus);
  const vault = new EnvCredentialVault({ secret: opts.token });
  const fileCredentials = new FileCredentialStore(opts.credentialsPath);
  const credentials = opts.credentials
    ? new RemoteCredentialStore({
        baseUrl: opts.credentials.url,
        orgSlug: opts.credentials.orgSlug,
        agentSlug: opts.credentials.agentSlug,
        podToken: opts.credentials.podToken,
        fallback: fileCredentials,
      })
    : fileCredentials;
  const sharedEndpoints = opts.sharedEndpoints
    ? new RemoteSharedEndpointStore({
        baseUrl: opts.sharedEndpoints.url,
        orgSlug: opts.sharedEndpoints.orgSlug,
        agentSlug: opts.sharedEndpoints.agentSlug,
        podToken: opts.sharedEndpoints.podToken,
      })
    : undefined;
  const sharedMirrorDir = opts.sharedMirror?.mirrorDir;
  const sharedMirror = opts.sharedMirror
    ? new SharedMirrorController({
        ...opts.sharedMirror,
        log: severityLog,
      })
    : undefined;
  const controlPlaneUrl = `http://127.0.0.1:${opts.port}`;
  const transcriptShadow = opts.durableTurns?.transcriptDualWrite
    ? new HttpTranscriptShadow({ gateway: opts.durableTurns.gateway })
    : undefined;
  const docShadow = opts.durableTurns?.transcriptDualWrite
    ? new HttpDocShadow({ gateway: opts.durableTurns.gateway })
    : undefined;
  const docProjector = docShadow
    ? new DocShadowProjector({ store, vfs, paths, shadow: docShadow })
    : undefined;
  const frameForwarder = opts.durableTurns?.turnLog
    ? new FrameForwarder({
        bus,
        sender: new HttpTurnLogSender({
          gateway:
            opts.durableTurns.turnlogGateway ?? opts.durableTurns.gateway,
        }),
      })
    : undefined;
  const standingFrameCapture = frameForwarder
    ? new StandingFrameCapture(bus, frameForwarder)
    : undefined;

  const spawner =
    opts.spawner ??
    new RuntimeProcessSpawner({
      command: opts.runtimeCommand,
      env: {
        ...(opts.systemPrompt
          ? { HOUSTON_SYSTEM_PROMPT: opts.systemPrompt }
          : {}),
        // Packaged: runtimeCommand() spawns this same compiled binary, so the
        // child must dispatch into RUNTIME role (sidecar-entry.ts reads this).
        // Additive to the per-runtime env the ProcessLauncher sets (workspace
        // dir, data dir, port, token). Only set when we ARE the compiled sidecar;
        // the dev `tsx <source>` command ignores it harmlessly anyway.
        ...(process.env.HOUSTON_SIDECAR_BINARY
          ? { HOUSTON_SIDECAR_ROLE: "runtime" }
          : {}),
        // Do not inherit a rollout flag into a runtime unless the host also
        // constructed its pod-auth facade from the complete managed config.
        HOUSTON_TRANSCRIPT_DUAL_WRITE: transcriptShadow ? "1" : "",
      },
      onLog: opts.onRuntimeLog,
    });

  // Stale-id fail-closed resolution + the setup-runtime carve-out live in
  // agent-dirs.ts (HOU-827 / HOU-1239) so both behaviors stay unit-tested.
  const agentDir = (id: string) => agentDirFor(opts.workspacesRoot, id);
  const liveAgentDir = (id: string) => liveAgentDirFor(opts.workspacesRoot, id);
  const launcher = new ProcessLauncher({
    spawner,
    workspaceDirFor: (a) => liveAgentDir(a.id),
    dataDirFor: (a) => join(liveAgentDir(a.id), ".houston", "runtime"),
    sharedSkillsDirFor: sharedMirrorDir
      ? () => join(sharedMirrorDir, "skills")
      : opts.gatewayFronted
        ? undefined
        : (a) =>
            join(
              opts.workspacesRoot,
              ...sharedSkillsDirKey(
                paths.sharedRoot({ id: a.workspaceId }),
              ).split("/"),
            ),
    mintToken: (a) => vault.sandboxToken(a.workspaceId, a.id),
    // Connect-once locally too: keyless runtimes fetch a fresh token from this
    // host, so the refresh token never sits in a runtime's environment.
    credentialServing: {
      controlPlaneUrl,
      mintSandboxToken: (a) => vault.sandboxToken(a.workspaceId, a.id),
    },
    afterSpawn:
      opts.gatewayFronted && sharedEndpoints
        ? async (_agent, runtime) => {
            await syncSharedEndpoint({ store: sharedEndpoints, runtime });
          }
        : undefined,
  });

  const channel = new ProxyChannel({
    launcher,
    proxy: { forward },
    credentials,
    // Desktop: clients talk to this host DIRECTLY (no gateway in front to mint
    // or strip identity headers), so an inbound x-houston-acting-as is
    // untrusted client input — never relay it to the runtime; identity is the
    // single local owner. Managed pods (gatewayFronted) ARE gateway-fronted:
    // the gateway minted the header, so relaying it is what lets the runtime's
    // integration calls act as the driving user (C2).
    forwardActingHeader: opts.gatewayFronted ?? false,
    beforeTurn: sharedMirror ? () => sharedMirror.beforeTurn() : undefined,
    turnLogCapture: standingFrameCapture,
  });
  const credentialHealer = opts.credentials
    ? new CredentialServeHealer(
        async ({ workspaceId, agentId, provider, actingAs }) => {
          const agent = await store.getAgent(agentId);
          if (!agent || agent.workspaceId !== workspaceId) return false;
          const result = await captureRuntimeCredential({
            endpoint: await launcher.ensureAwake(agent),
            credentials,
            workspaceId,
            provider,
            // Automatic capture: only local-origin credentials. Refresh-bearing
            // OAuth (a fresh login / lost-scrub leftover) and api_keys the
            // runtime attests were NOT serve-written (PRODUCT-1370: heals the
            // pasted Anthropic setup token after a missed capture) — never a
            // served projection, which would resurrect a central disconnect.
            localOriginOnly: true,
            // The member whose serve missed — their runtime file, their row.
            actingAs,
            // AUTOMATIC re-push (no user behind it): fill-only, per the store's
            // maintenance contract. A plain PUT is reserved for a real user
            // (re)connect because it clears the gateway's revocation tombstone
            // (cloud #230) — the healer re-exporting a pod's leftover copy
            // after a recycle was the one resurrection path that survived
            // (PRODUCT-1318).
            ifAbsent: true,
          });
          return result.ok;
        },
      )
    : undefined;

  // Integrations (platform model): the desktop holds NO provider key — the
  // gateway adapter forwards every call to Houston's cloud host with the user's
  // Supabase session (kept fresh by the frontend via PUT /v1/integrations/
  // session). Self-host/dev goes direct with its own COMPOSIO_API_KEY instead.
  // A leftover `integrations.json` from the retired "Composio for you" model
  // means this user's old connections are gone — surface the one-time
  // reconnect notice (their personal long-lived key is no longer used: a
  // security improvement, and the UI says so). Dismissing it DELETES the file
  // (it still holds that retired plaintext key), which also clears the flag —
  // active() re-checks the disk on every status read, no restart needed.
  // Gateway wins when both are configured: a machine that CAN forward to the
  // key's real custodian should, and it makes dev's prod-simulation a one-knob
  // toggle (drop the URL from .env.local → direct mode with your own key).
  const sessionToken = { current: null as string | null };
  const legacyIntegrationsPath = join(
    dirname(opts.credentialsPath),
    "integrations.json",
  );
  // The DIRECT Composio adapter (self-host / dev with an own key). Only when NOT
  // in gateway mode (gatewayUrl wins), where the desktop forwards to Houston's
  // cloud host with the user's Supabase session instead.
  const directProvider =
    opts.integrations?.composioApiKey && !opts.integrations?.gatewayUrl
      ? new ComposioProvider({ apiKey: opts.integrations.composioApiKey })
      : undefined;
  const composioProvider = opts.integrations?.gatewayUrl
    ? new RemoteIntegrationProvider({
        id: "composio",
        upstreamUrl: opts.integrations.gatewayUrl,
        token: () => sessionToken.current,
        // Managed pods pass their host token so routine turns authenticate as
        // the creator; the desktop leaves this undefined.
        podToken: opts.integrations.podToken,
      })
    : (directProvider ?? null);

  // Custom integrations (HOU-550): user-added API/MCP sources compiled to
  // agent tools by the embedded executor engine. Key-free and session-free —
  // definitions + secrets live on THIS host's disk — so the provider is wired
  // unconditionally: an install with no Composio at all can still add its own.
  const customDir = dirname(opts.credentialsPath);
  const customStore = new FileCustomIntegrationStore(
    join(customDir, "custom-integrations.json"),
  );
  const legacyCustomSecrets = new FileCustomSecretStore(
    join(customDir, "custom-integration-secrets.json"),
  );
  const remoteCustomSecrets = opts.credentials
    ? new RemoteCustomSecretStore({
        baseUrl: opts.credentials.url,
        orgSlug: opts.credentials.orgSlug,
        agentSlug: opts.credentials.agentSlug,
        podToken: opts.credentials.podToken,
        legacy: legacyCustomSecrets,
      })
    : undefined;
  const customSecrets = remoteCustomSecrets ?? legacyCustomSecrets;
  const customExecutor = new CustomExecutorHost(customSecrets, () =>
    customStore.list(),
  );
  const customProvider = new CustomIntegrationProvider(
    customStore,
    customExecutor,
  );
  // OAuth sign-in for custom MCP servers (PRODUCT-1172): only a deployment
  // whose callback a browser can actually reach offers it. The desktop
  // sidecar (local profile, loopback bind) derives its own base; self-host
  // opts in with an explicit public origin; managed pods stay off until the
  // gateway serves a callback.
  const oauthCallbackBase =
    opts.oauthCallbackBase ??
    ((opts.capabilities ?? LOCAL_CAPABILITIES).profile === "local" &&
    (opts.bind ?? "127.0.0.1") === "127.0.0.1"
      ? `http://127.0.0.1:${opts.port}`
      : undefined);
  const customIntegrations = new CustomIntegrationManager(
    customStore,
    customSecrets,
    customExecutor,
    () => events.emit(LOCAL_USER, { type: "CustomIntegrationsChanged" }),
    oauthCallbackBase
      ? {
          callbackUrl: `${oauthCallbackBase.replace(/\/+$/, "")}${CUSTOM_OAUTH_CALLBACK_PATH}`,
          // A gateway-fronted pod's callback is the GATEWAY's public route:
          // the browser lands there, and the gateway routes it to this pod by
          // the `<org>.<agent>.` prefix minted into the state. Loopback bases
          // (desktop, dev engines) land on this host directly and need none —
          // but carrying it is harmless, so it rides whenever the pod knows
          // its coordinates.
          ...(opts.credentials
            ? {
                statePrefix: `${opts.credentials.orgSlug}.${opts.credentials.agentSlug}`,
              }
            : {}),
        }
      : {},
  );

  const registry = new IntegrationRegistry([
    ...(composioProvider ? [composioProvider] : []),
    customProvider,
  ]);
  const integrations = {
    registry,
    ...(opts.integrations?.gatewayUrl
      ? {
          session: {
            set: (token: string | null) => {
              sessionToken.current = token;
            },
          },
        }
      : {}),
    reconnectNotice: {
      active: () => existsSync(legacyIntegrationsPath),
      // force: already-gone is success (idempotent dismiss); a real
      // failure (EACCES…) throws and surfaces as the route's error.
      dismiss: () => rmSync(legacyIntegrationsPath, { force: true }),
    },
  };

  // Did this install carry over a Rust-desktop chat-history db? Its mere
  // presence means the user is migrating from the legacy desktop build — their
  // agents + history came across but their provider credentials did NOT (a
  // different OAuth client), so the UI must guide them to reconnect once. A
  // synchronous existence check (the same gate `start()` uses before running
  // the migration) is enough; surfaced on `/v1/version` for the frontend to
  // read. Stays true across re-boots (the db file lingers), but the UI persists
  // its own "already shown" flag, so the reconnect moment still fires only once.
  const chatHistoryMigrated = !!(
    opts.chatHistoryDbPath && existsSync(opts.chatHistoryDbPath)
  );

  // C9 event-driven routines are served ONLY where the Go cloud gateway fronts
  // the deployment (managed cloud): the Go control plane owns trigger
  // reconciliation and the ingress, and the gateway's edge advertises the
  // `triggers` capability. This TS host carries no self-host trigger backend —
  // the pod's only trigger surface is the delivery route (trigger-events), wired
  // below via `triggerLock`. Self-host and desktop simply don't get triggers.

  // The installed agent-config library. FsVfs keys must be non-empty, so root
  // the vfs at the library's PARENT and address it by its basename — this vfs
  // instance is only ever handed to the agent-configs route, which stays under
  // that prefix.
  const agentConfigs = opts.agentConfigsDir
    ? {
        vfs: new FsVfs(dirname(opts.agentConfigsDir)),
        root: () => basename(opts.agentConfigsDir as string),
      }
    : undefined;

  const capabilities: Capabilities = {
    ...(opts.capabilities ?? LOCAL_CAPABILITIES),
    // Served capabilities advertise the integrations actually wired, not the
    // profile's nominal list — an unconfigured deployment says [] honestly.
    integrations: registry.ids(),
    // On exactly when this host serves a browser-reachable OAuth callback.
    customIntegrationOAuth: customIntegrations.oauthSupported,
    // `triggers` is never advertised here: this host has no trigger backend. On
    // managed cloud the Go edge advertises the capability; a pod/self-host/desktop
    // stays byte-identical to the nominal profile (absent = off, protocol #core).
  };
  const syncDaemon = opts.storeSync
    ? new StoreSyncDaemon({
        ...opts.storeSync,
        rootDir: dirname(opts.workspacesRoot),
        // FsWatcher below already watches this subtree for reactivity. Avoid a
        // second, redundant inotify watch over it (HOU-1237).
        watchExcludeDirs: [opts.workspacesRoot],
        log: severityLog,
      })
    : undefined;
  const deps: ControlPlaneDeps = {
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
    chatHistoryMigrated,
    integrations,
    customIntegrations,
    // Every local host has a turn bus, so the internal pod trigger-events route is
    // always available — on managed cloud the Go control plane POSTs delivered
    // events to it. The lock dedupes redeliveries.
    triggerLock: bus,
    routineFireLock: bus,
    routineFireDedupTtlSec: opts.gatewayFronted ? 86_400 : 3600,
    transcriptShadow,
    agentConfigs,
    // Managed pods record the gateway-minted acting identity as a routine's
    // `created_by` (C2 — the sub the gateway re-authorizes at fire time);
    // the desktop ignores the header and keeps stamping the local owner.
    gatewayFronted: opts.gatewayFronted ?? false,
    // Event-driven routines fire only where a trigger backend exists (Houston
    // Cloud). Off on desktop/self-host: the write gate refuses trigger bindings
    // and the trigger-status route reports them as unable to wake.
    triggersEnabled: opts.triggersEnabled ?? false,
    loopbackEgress: opts.loopbackEgress ?? false,
    // The desktop shell reveals/opens agent folders in the OS file manager;
    // give it the REAL directory (the agent id is a route key, not a path).
    agentDir: (_ws, a) => agentDir(a.id),
    corsOrigin: "*",
    // Boot-span ledger behind GET /metrics (HOU-1011). Token-gated like every
    // non-public route: timings aren't secrets, but there is no reason to
    // widen the unauthenticated surface for them.
    metrics: { render: () => boot.render(), contentType: boot.contentType },
    storeFenced: syncDaemon ? () => syncDaemon.fenced : undefined,
    addressedAgent: docProjector
      ? (agentId) => docProjector.bindAddressed(agentId)
      : undefined,
    // Publish the view routes' answers (providers, usage, custom definitions)
    // to the managed doc store; the gateway serves them while the pod is
    // asleep. Cloud pods only (docShadow exists only under dual-write).
    viewSink: docShadow
      ? (_agentId, family, body) => {
          void docShadow.put(family, body).catch((error: unknown) => {
            console.error(`[view-docs] ${family} publish failed`, error);
          });
        }
      : undefined,
  };

  const server = createControlPlaneServer(deps);
  // The agent (or the user) editing files directly → reactivity, no host write.
  const watcher = new FsWatcher(opts.workspacesRoot, (event) => {
    events.emit(LOCAL_USER, event);
    docProjector?.onEvent(event);
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
  });
  // Managed pods sample their own busy state (the gateway can only see AWAKE
  // from outside) and report per-day active totals to the compute-usage ingest.
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
        // The activityStatus busy logic MINUS activeRequests: an open UI tab's
        // SSE subscription keeps the pod awake but is not the agent working.
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
  let stopPromise: Promise<void> | undefined;

  return {
    server,
    async start() {
      // Boot-phase stamps. Everything before the listening banner used to be
      // silent, which made a 15 s managed-pod wake unattributable from logs;
      // process.uptime() in the first stamp exposes module-eval cost, and the
      // banner's own timestamp closes the ledger.
      const bootStamp = (phase: string) =>
        console.log(
          `[local-host] boot: ${phase} at +${process.uptime().toFixed(1)}s`,
        );
      bootStamp("module eval done");
      boot.record("module_eval", process.uptime() * 1000);
      // The object store is authoritative in managed server mode. Hydration is
      // readiness-critical and must finish before migrations or HTTP listening;
      // failure propagates so the pod restarts without ever syncing an empty tree.
      if (syncDaemon) {
        const objects = await boot.time("hydrate", () => syncDaemon.hydrate());
        boot.setHydratedObjects(objects);
      }
      const migrationsT0 = Date.now();
      // Shared storage is a disposable synchronized mirror, not a readiness
      // invariant. Start its pull after authoritative agent hydration but do
      // not await the network; the first turn joins it through beforeTurn.
      if (sharedMirrorDir) {
        try {
          mkdirSync(sharedMirrorDir, { recursive: true });
          sharedMirror?.wake();
        } catch (error) {
          severityLog(
            "[shared-mirror] wake sync failed; using current mirror",
            error,
          );
        }
      }
      // Managed cloud: migrate the hydrated plaintext custom-integration file
      // into Secret Manager before starting the watcher/sync loop. Removing it
      // after every upload succeeds makes the first sync delete the old GCS
      // object; a partial failure leaves it intact for a safe boot retry.
      // Passive hosts (a read-only conversion source) must not mutate custody:
      // no legacy migration.
      if (remoteCustomSecrets && !opts.passive) {
        const migrated = await remoteCustomSecrets.migrateLegacy();
        if (migrated > 0) {
          console.log(
            `[local-host] migrated ${migrated} custom integration secret(s) to remote custody`,
          );
        }
      }
      // One-time, idempotent migration of the pre-v0.4 FLAT `.houston/` layout
      // into the per-type folders the domain reads (ported from the Rust
      // engine's migrate_agent_data). Runs BEFORE the watcher so migrated files
      // are on disk when reactivity turns on; originals stay in place as a
      // rollback net and re-boots are no-ops (old-exists && new-missing).
      try {
        migrateAgentLayouts({ workspacesRoot: opts.workspacesRoot });
      } catch (err) {
        // No UI thread to toast on at boot; the supervisor must stay up. Log
        // loudly so the failure shows in the app logs / bug report tail.
        console.error(
          "[local-host] agent-layout migration failed (continuing):",
          err,
        );
      }
      // Bring every EXISTING agent's seeded `.houston/**.schema.json` up to the
      // schemas this build ships (they are seeded once, at agent creation, and
      // are app data — a stale `additionalProperties: false` copy actively tells
      // the model to strip fields the host stamps). Content-compared, so a
      // steady-state boot writes nothing; runs BEFORE the watcher like the
      // migrations above.
      try {
        reseedAgentSchemas({ workspacesRoot: opts.workspacesRoot });
      } catch (err) {
        // No UI thread to toast on at boot; the supervisor must stay up. Log
        // loudly so the failure shows in the app logs / bug report tail.
        console.error(
          "[local-host] agent schema re-seed failed (continuing):",
          err,
        );
      }
      // Additive, idempotent migration of the Rust-desktop era's chat history
      // (SQLite chat_feed) into each agent's `.houston/runtime/`. Runs BEFORE
      // the watcher so its writes are already on disk when reactivity turns
      // on, and only when the db is actually present. Never modifies the db or
      // the existing tree; per-conversation existence checks make re-boots
      // cheap no-ops (deliberately re-scanned every boot — see chat-history.ts
      // on why a wholesale per-agent marker lost data).
      if (opts.chatHistoryDbPath && existsSync(opts.chatHistoryDbPath)) {
        try {
          migrateChatHistory({
            workspacesRoot: opts.workspacesRoot,
            dbPath: opts.chatHistoryDbPath,
          });
        } catch (err) {
          // No UI thread to toast on at boot; the supervisor must stay up. Log
          // loudly so the failure shows in the app logs / bug report tail.
          console.error(
            "[local-host] chat-history migration failed (continuing):",
            err,
          );
        }
      }
      boot.record("migrations", Date.now() - migrationsT0);
      bootStamp("hydration + migrations done");
      const bind = opts.bind ?? "127.0.0.1";
      await boot.time(
        "listen",
        () =>
          new Promise<void>((resolve) =>
            server.listen(opts.port, bind, () => resolve()),
          ),
      );
      // Passive migration-source mode runs no background daemons (a read-only
      // source must not fire routines, sync, or churn watch events).
      if (!opts.passive) {
        // Seed the doc shadow at boot (revisions + one content projection),
        // never blocking readiness. Inside the passive gate: the seed now
        // WRITES docs, and a passive migration-source host pushing its old
        // tree's families over the live agent's docs is exactly the
        // stale-data overwrite passivity exists to prevent.
        docProjector?.seed();
        if (docShadow) {
          // Self-warm the view docs so an agent asleep since before views
          // existed gets them published without a first slow client read.
          warmViewDocs({ port: opts.port, token: opts.token, store });
        }
        watcher.start();
        syncDaemon?.start();
        scheduler.start();
        usageSampler?.start();
      }
      console.log(formatIntegrationsModeLog(opts.integrations));
      // The banner the Tauri supervisor parses (mirrors the runtime's contract).
      // The full token rides ONLY for the desktop sidecar; a pod/self-host token
      // is env-supplied and redacted so it never lands in plaintext logs.
      console.log(
        formatHostListeningBanner({
          port: opts.port,
          token: opts.token,
          redactToken: opts.redactBannerToken ?? false,
        }),
      );
      boot.markReady();
      // One-shot boot report to the gateway (HOU-1011): pods scale to zero, so
      // Prometheus can't scrape a boot — push the ledger instead. Same gateway
      // quadruple as usage reporting; absent on desktop/self-host = no report.
      const reportBoot = () => {
        if (!opts.usageReporting) return;
        void sendBootReport({
          report: opts.usageReporting,
          telemetry: boot,
          log: severityLog,
        });
      };
      if (opts.eagerRuntime) {
        // Fire-and-forget AFTER the banner: /health (and the supervisor)
        // must never wait on a runtime boot — the point is overlap, and a
        // runtime that fails here heals exactly like it always has (the
        // next dispatch retries the spawn). Sequential on purpose: a pod
        // hosts one agent, and a multi-agent tree shouldn't stampede the
        // CPU it shares with the boot it is overlapping.
        void (async () => {
          const spawnT0 = Date.now();
          for (const ws of await store.listWorkspaces()) {
            for (const agent of await store.listAgents(ws.id)) {
              await launcher.ensureAwake(agent).catch((err) => {
                console.error(
                  `[local-host] eager runtime spawn failed for ${agent.id} (continuing):`,
                  err,
                );
              });
            }
          }
          // The report waits for the spawn on purpose: it's the slowest boot
          // step (~10s) and the whole point of the ledger (HOU-867).
          boot.record("runtime_spawn", Date.now() - spawnT0);
          reportBoot();
        })();
      } else {
        reportBoot();
      }
    },
    stop() {
      if (stopPromise) return stopPromise;
      stopPromise = (async () => {
        scheduler.stop();
        watcher.stop();
        standingFrameCapture?.stop();
        frameForwarder?.stop();
        // Drain the last accrued stretch before the runtimes go down; the
        // sampler swallows report failures, so this never blocks a shutdown.
        await usageSampler?.stop();
        // Await actual child exit (bounded): the final sync below must not
        // walk /data while a runtime is still flushing its last writes.
        await launcher.shutdownAllAndWait();
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
