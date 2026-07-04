import { existsSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { dirname, join } from "node:path";
import { SingleUserVerifier } from "../auth/verify";
import { LOCAL_CAPABILITIES } from "../capabilities";
import { ProxyChannel } from "../channel/proxy";
import { FileCredentialStore } from "../credentials/file-store";
import { EnvCredentialVault } from "../credentials/vault";
import { BusEventHub } from "../events/hub";
import { ComposioProvider } from "../integrations/composio";
import { IntegrationRegistry } from "../integrations/registry";
import { RemoteIntegrationProvider } from "../integrations/remote";
import { ProcessLauncher, type RuntimeSpawner } from "../launcher/process";
import { RuntimeProcessSpawner } from "../launcher/runtime-spawner";
import { migrateChatHistory } from "../migrate/chat-history";
import { LocalPaths } from "../paths";
import { forward } from "../proxy/route";
import { ChannelRoutineFirer } from "../schedule/firer";
import { Scheduler } from "../schedule/scheduler";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { LocalWorkspaceStore } from "../store/local";
import { MemoryTurnBus } from "../turn/bus";
import { FsVfs } from "../vfs";
import { FsWatcher } from "../watch/watcher";
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
   * True only when a trusted gateway fronts EVERY request to this host (the
   * managed cloud pod: the gateway enforces the pod token and mints/strips
   * `x-houston-acting-as` itself). Relays that header to the runtime so a
   * turn's integration calls authenticate as the driving user (C2). On the
   * desktop clients reach this host directly, so an inbound acting header is
   * untrusted client input — leave this false (the default) and it is dropped.
   */
  gatewayFronted?: boolean;
}

export interface LocalHost {
  server: Server;
  start(): Promise<void>;
  stop(): void;
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
  const events = new BusEventHub(bus);
  const vault = new EnvCredentialVault({ secret: opts.token });
  const credentials = new FileCredentialStore(opts.credentialsPath);
  const controlPlaneUrl = `http://127.0.0.1:${opts.port}`;

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
      },
      onLog: opts.onRuntimeLog,
    });

  // agent.id is "<Workspace>/<Agent>" — split it back into the on-disk dir.
  const agentDir = (id: string) => join(opts.workspacesRoot, ...id.split("/"));
  const launcher = new ProcessLauncher({
    spawner,
    workspaceDirFor: (a) => agentDir(a.id),
    dataDirFor: (a) => join(agentDir(a.id), ".houston", "runtime"),
    mintToken: (a) => vault.sandboxToken(a.workspaceId, a.id),
    // Connect-once locally too: keyless runtimes fetch a fresh token from this
    // host, so the refresh token never sits in a runtime's environment.
    credentialServing: {
      controlPlaneUrl,
      mintSandboxToken: (a) => vault.sandboxToken(a.workspaceId, a.id),
    },
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
  });

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
  const registry = opts.integrations?.gatewayUrl
    ? new IntegrationRegistry([
        new RemoteIntegrationProvider({
          id: "composio",
          upstreamUrl: opts.integrations.gatewayUrl,
          token: () => sessionToken.current,
          // Managed pods pass their host token so routine turns authenticate as
          // the creator; the desktop leaves this undefined.
          podToken: opts.integrations.podToken,
        }),
      ])
    : opts.integrations?.composioApiKey
      ? new IntegrationRegistry([
          new ComposioProvider({ apiKey: opts.integrations.composioApiKey }),
        ])
      : null;
  const integrations = registry
    ? {
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
      }
    : undefined;

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

  const deps: ControlPlaneDeps = {
    verifier: new SingleUserVerifier({ token: opts.token, userId: LOCAL_USER }),
    store,
    credentials,
    vault,
    vfs,
    paths,
    events,
    channels: { local: channel },
    // Served capabilities advertise the integrations actually wired, not the
    // profile's nominal list — an unconfigured deployment says [] honestly.
    capabilities: {
      ...(opts.capabilities ?? LOCAL_CAPABILITIES),
      integrations: registry?.ids() ?? [],
    },
    chatHistoryMigrated,
    integrations,
    corsOrigin: "*",
  };

  const server = createControlPlaneServer(deps);
  // The agent (or the user) editing files directly → reactivity, no host write.
  const watcher = new FsWatcher(opts.workspacesRoot, (e) =>
    events.emit(LOCAL_USER, e),
  );
  const scheduler = new Scheduler({
    store,
    vfs,
    paths,
    lock: bus,
    firer: new ChannelRoutineFirer({ local: channel }),
    events,
  });

  return {
    server,
    async start() {
      // One-time, additive, idempotent migration of the Rust-desktop era's chat
      // history (SQLite chat_feed) into each agent's `.houston/runtime/`. Runs
      // BEFORE the watcher so its writes are already on disk when reactivity
      // turns on, and only when the db is actually present. Never modifies the
      // db or the existing tree, and a `.migrated` marker makes re-boots no-ops.
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
      const bind = opts.bind ?? "127.0.0.1";
      await new Promise<void>((resolve) =>
        server.listen(opts.port, bind, () => resolve()),
      );
      watcher.start();
      scheduler.start();
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
    },
    stop() {
      scheduler.stop();
      watcher.stop();
      launcher.shutdownAll(); // kill spawned runtimes — never orphan them
      server.close();
    },
  };
}
