import { join } from "node:path";
import type { Server } from "node:http";
import type { Capabilities } from "@houston/protocol";
import { createControlPlaneServer, type ControlPlaneDeps } from "../server";
import { LocalWorkspaceStore } from "../store/local";
import { FsVfs } from "../vfs";
import { LocalPaths } from "../paths";
import { MemoryTurnBus } from "../turn/bus";
import { BusEventHub } from "../events/hub";
import { EnvCredentialVault } from "../credentials/vault";
import { FileCredentialStore } from "../credentials/file-store";
import { ProcessLauncher, type RuntimeSpawner } from "../launcher/process";
import { BunRuntimeSpawner } from "../launcher/bun-spawner";
import { ProxyChannel } from "../channel/proxy";
import { SingleUserVerifier } from "../auth/verify";
import { FsWatcher } from "../watch/watcher";
import { Scheduler } from "../schedule/scheduler";
import { ChannelRoutineFirer } from "../schedule/firer";
import { forward } from "../proxy/route";

/** The single local user every request resolves to. */
export const LOCAL_USER = "local-owner";

/** What a desktop deployment can do — the Tauri shell handles OS-native bits. */
export const LOCAL_CAPABILITIES: Capabilities = {
  profile: "local",
  revealInOs: true,
  terminal: true,
  // Mobile pairing is gone — phones use the web app now (no tunnel/relay).
  tunnel: false,
  codeExecution: "local-bash",
  providers: ["anthropic", "openai-codex"],
};

export interface LocalHostOptions {
  /** `~/.houston/workspaces` — the desktop tree (FsVfs root + store root). */
  workspacesRoot: string;
  /** Where the connect-once credential file lives (e.g. `~/.houston/credentials.json`). */
  credentialsPath: string;
  /** Loopback port; the Tauri shell reads it from the startup banner. */
  port: number;
  /** Random per-boot token the shell presents on every request (SingleUserVerifier). */
  token: string;
  /** argv to launch a pi-runtime: dev `["bun","run",".../runtime/src/main.ts"]`, prod the sidecar. */
  runtimeCommand: string[];
  /** Product system prompt the app injects into every runtime (voice rules). */
  systemPrompt?: string;
  /** Per-runtime log sink (the app's logs). */
  onRuntimeLog?: (line: string) => void;
  /** Test seam: a fake spawner so the wiring is exercisable without real processes. */
  spawner?: RuntimeSpawner;
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
    new BunRuntimeSpawner({
      command: opts.runtimeCommand,
      env: opts.systemPrompt ? { HOUSTON_SYSTEM_PROMPT: opts.systemPrompt } : {},
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
    credentialServing: { controlPlaneUrl, mintSandboxToken: (a) => vault.sandboxToken(a.workspaceId, a.id) },
  });

  const channel = new ProxyChannel({ launcher, proxy: { forward }, credentials });

  const deps: ControlPlaneDeps = {
    verifier: new SingleUserVerifier({ token: opts.token, userId: LOCAL_USER }),
    store,
    credentials,
    vault,
    vfs,
    paths,
    events,
    channels: { local: channel },
    capabilities: LOCAL_CAPABILITIES,
    corsOrigin: "*",
  };

  const server = createControlPlaneServer(deps);
  // The agent (or the user) editing files directly → reactivity, no host write.
  const watcher = new FsWatcher(opts.workspacesRoot, (e) => events.emit(LOCAL_USER, e));
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
      await new Promise<void>((resolve) => server.listen(opts.port, "127.0.0.1", () => resolve()));
      watcher.start();
      scheduler.start();
      // The banner the Tauri supervisor parses (mirrors the runtime's contract).
      console.log(`HOUSTON_HOST_LISTENING port=${opts.port} token=${opts.token}`);
    },
    stop() {
      scheduler.stop();
      watcher.stop();
      launcher.shutdownAll(); // kill spawned runtimes — never orphan them
      server.close();
    },
  };
}
