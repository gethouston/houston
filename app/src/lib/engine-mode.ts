/**
 * Whether this build talks to the v3 Houston host (host mode) instead
 * of the Tauri-spawned Rust engine.
 *
 * This MUST mirror `useHost` in `app/vite.config.ts`, which aliases
 * `@houston-ai/engine-client` to the host adapter exactly when one of
 * these flags is set. The adapter decides its protocol (v3 host vs the
 * Rust wire) from `window.__HOUSTON_CP__` at HoustonClient *construction* time,
 * so the flag has to be a deterministic build constant set before any client is
 * built — NOT a value injected by the Tauri host handshake, which can lose the
 * race against the `get_engine_handshake` poll / `houston-engine-ready` event
 * and leave a Rust-wire client pointed at a v3 host. See HOU-546.
 */
type EngineModeEnv = {
  VITE_NEW_ENGINE_URL?: string;
  VITE_HOSTED_ENGINE_URL?: string;
  VITE_NEW_ENGINE?: string;
  /**
   * Auth method for the hosted engine (`VITE_HOSTED_ENGINE_URL`). The
   * enable/disable switch for the Supabase Google-login gate — see
   * {@link hostedAuthMode}. Independent of `VITE_HOSTED_ENGINE_URL` so a
   * developer can point the desktop app at a hosted gateway (e.g. the local
   * kind cluster) and toggle the OAuth login on or off without changing the URL.
   */
  VITE_HOSTED_ENGINE_AUTH?: string;
};

export function controlPlaneBuild(env: EngineModeEnv): boolean {
  return (
    Boolean(env.VITE_NEW_ENGINE_URL) ||
    Boolean(env.VITE_HOSTED_ENGINE_URL) ||
    env.VITE_NEW_ENGINE === "1" ||
    env.VITE_NEW_ENGINE === "true"
  );
}

/**
 * Provider OAuth loopback only works when the browser and runtime are
 * co-located on the same desktop machine. A Tauri desktop pointed at a remote
 * host is still a remote client for provider auth: the runtime's localhost
 * callback is on the remote host, not the user's machine, so Codex/OpenAI must
 * use the device-code flow.
 */
export function providerLoginUsesDeviceAuthByDefault(
  env: Pick<EngineModeEnv, "VITE_NEW_ENGINE_URL" | "VITE_HOSTED_ENGINE_URL">,
  client: { isTauri: boolean },
): boolean {
  return (
    !client.isTauri ||
    Boolean(env.VITE_NEW_ENGINE_URL) ||
    Boolean(env.VITE_HOSTED_ENGINE_URL)
  );
}

/**
 * Whether Codex/OpenAI (ChatGPT) sign-in should use the desktop's own
 * zero-code loopback relay instead of the device-code flow.
 *
 * Unlike {@link providerLoginUsesDeviceAuthByDefault}, this is true for a Tauri
 * desktop even when the engine is REMOTE: the runtime hands back an authorize
 * URL, the desktop binds its OWN localhost listener
 * (`start_codex_oauth_loopback`), opens the URL in the user's browser, and
 * relays the `code=...&state=...` the callback carries back to the engine via
 * `submitLoginCode`. The callback lands on the user's machine, so co-location
 * with the engine is irrelevant. A plain browser client has no local listener
 * and still falls back to device code.
 */
export function codexUsesLoopbackRelay(client: { isTauri: boolean }): boolean {
  return client.isTauri;
}

/** How the desktop authenticates to the hosted engine (`VITE_HOSTED_ENGINE_URL`). */
export type HostedAuthMode =
  /** Supabase Google login: prompt sign-in, send the session token as bearer. */
  | "oauth"
  /** Static bearer (`VITE_HOSTED_ENGINE_TOKEN` / `VITE_NEW_ENGINE_TOKEN`): no login. */
  | "static";

/**
 * Resolve the hosted-engine auth method from `VITE_HOSTED_ENGINE_AUTH`.
 *
 * This is the enable/disable switch for the hosted Google-login flow. An
 * explicit value wins; otherwise the presence of a hosted URL implies OAuth
 * (managed cloud is authenticated by default — the documented contract), and a
 * plain self-host / dev build with no hosted URL stays static.
 *
 * Accepted values (case-insensitive): `oauth` | `supabase` | `google` | `1` |
 * `true` | `on` ⇒ OAuth; `static` | `token` | `none` | `0` | `false` | `off` ⇒
 * static. Anything else falls back to the default.
 */
export function hostedAuthMode(env: EngineModeEnv): HostedAuthMode {
  const raw = (env.VITE_HOSTED_ENGINE_AUTH ?? "").trim().toLowerCase();
  if (["oauth", "supabase", "google", "1", "true", "on"].includes(raw)) {
    return "oauth";
  }
  if (["static", "token", "none", "0", "false", "off"].includes(raw)) {
    return "static";
  }
  return env.VITE_HOSTED_ENGINE_URL ? "oauth" : "static";
}

/**
 * True when the desktop should run the Supabase Google-login gate for the hosted
 * engine: a hosted gateway URL is set AND its auth mode is OAuth. Static-token
 * hosted mode (and every non-hosted build) returns false and skips the login UI.
 */
export function hostedOauthLoginActive(env: EngineModeEnv): boolean {
  return Boolean(env.VITE_HOSTED_ENGINE_URL) && hostedAuthMode(env) === "oauth";
}

/** The screen the hosted Google-login gate should render for a given auth state. */
export type HostedGateState =
  /** Hosted OAuth is on but no Supabase project is configured — can't sign in. */
  | "misconfigured"
  /** Resolving the persisted session, or applying a fresh token to the engine. */
  | "loading"
  /** No session — prompt "Continue with Google". */
  | "sign-in"
  /** Signed in and the engine client is bootstrapped — render the app. */
  | "ready";

/**
 * Pure decision for {@link HostedEngineGate}. Only consulted when the hosted
 * OAuth gate is active, so OAuth is assumed; the only escape hatch is a build
 * that enabled hosted OAuth without baking Supabase creds, which can never
 * produce a token (`misconfigured`) — surfaced loudly instead of spinning
 * forever on the "starting" splash.
 */
export function hostedGateState(input: {
  authConfigured: boolean;
  sessionLoading: boolean;
  hasSession: boolean;
  engineReady: boolean;
}): HostedGateState {
  if (!input.authConfigured) return "misconfigured";
  if (input.sessionLoading) return "loading";
  if (!input.hasSession) return "sign-in";
  if (!input.engineReady) return "loading";
  return "ready";
}

/**
 * The concrete engine transport the app should bootstrap, from the build-time
 * env flags.
 *
 * - `static-host` — `VITE_NEW_ENGINE_URL` (baked host URL + static token).
 * - `hosted-oauth` — `VITE_HOSTED_ENGINE_URL`, authenticated with a Supabase
 *   session token (the managed-cloud default).
 * - `hosted-static` — `VITE_HOSTED_ENGINE_URL` with OAuth toggled off.
 * - `sidecar` — the Tauri-spawned engine subprocess (Rust in the default build,
 *   the TS host under the `host-sidecar` feature). Also what `packages/web`
 *   resolves to: it reuses this module verbatim, injects
 *   `window.__HOUSTON_ENGINE__` itself, and `engine.ts` adopts that config.
 */
export type ResolvedEngine =
  | { kind: "static-host"; url: string }
  | { kind: "hosted-oauth"; url: string }
  | { kind: "hosted-static"; url: string }
  | { kind: "sidecar" };

/**
 * Resolve the one transport the app should use from the build-time env flags.
 *
 * The gateway URL is baked into the build (HOU-642): a build-baked target (a
 * host URL, or a hosted gateway) wins, and everything else — the default Rust
 * build, the TS-engine dev loop, and the browser build — runs against its
 * co-located sidecar / injected config. There is no runtime chooser.
 */
export function resolveEngine(env: EngineModeEnv): ResolvedEngine {
  if (env.VITE_NEW_ENGINE_URL) {
    return { kind: "static-host", url: env.VITE_NEW_ENGINE_URL };
  }
  if (env.VITE_HOSTED_ENGINE_URL) {
    return hostedAuthMode(env) === "oauth"
      ? { kind: "hosted-oauth", url: env.VITE_HOSTED_ENGINE_URL }
      : { kind: "hosted-static", url: env.VITE_HOSTED_ENGINE_URL };
  }
  return { kind: "sidecar" };
}
