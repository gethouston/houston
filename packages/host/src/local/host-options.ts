import type { RuntimeSpawner } from "../launcher/process";
import type { ControlPlaneDeps } from "../server";
import type { ManagedHostOptions } from "./host-managed-options";

export interface LocalHostOptions extends ManagedHostOptions {
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
}
