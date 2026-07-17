import {
  getOAuthProvider,
  type OAuthDeviceCodeInfo,
  OPENAI_CODEX_BROWSER_LOGIN_METHOD,
  OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD,
} from "@earendil-works/pi-ai/oauth";
import type { LoginInfo } from "@houston/runtime-client";
import {
  type CustomEndpointInput,
  clearCustomEndpointConfig,
  OPENAI_COMPATIBLE,
  setCustomEndpointConfig,
} from "../ai/openai-compatible";
import { piProviderIds } from "../ai/pi-catalog";
import {
  activeProvider,
  isProvider,
  PROVIDERS,
  type ProviderId,
  providerAuthMethod,
} from "../ai/providers";
import {
  logoutAnthropicCredential,
  refreshAnthropicCredential,
} from "../backends/claude/credential-status";
import { runAnthropicSetupTokenLogin } from "./anthropic-setup-token";
import { preflightCodexCallbackPort } from "./codex-port-preflight";
import { authStorage, providerConnected } from "./storage";

/**
 * Multi-provider OAuth login, driven server-side and relayed to the webapp.
 *
 * - anthropic (Claude): the sanctioned setup-token flow. The direct OAuth PKCE
 *   replay is server-blocked since 2026-04, so we drive Anthropic's own
 *   `claude setup-token` (or take a pasted token) and store the resulting
 *   `sk-ant-oat01…` as an api_key. Same `auth_code` + completeLogin wire shape as
 *   before — see auth/anthropic-setup-token.ts.
 * - openai-codex (ChatGPT/Codex): the CLIENT picks. A co-located desktop client
 *   sends `deviceAuth: false` and gets the browser/loopback login — the user
 *   approves in their own browser and the localhost callback finishes it, no
 *   code. A remote webapp (cloud or self-host) sends `deviceAuth: true` and gets
 *   the device-code grant — the user types a one-time code while the runtime
 *   polls. See `codexLoginMethod`.
 */

type LoginState = {
  status: "starting" | "awaiting_user" | "complete" | "error";
  info?: LoginInfo;
  error?: string;
  resolvePaste?: (code: string) => void;
  rejectPaste?: (err: Error) => void;
  abort?: AbortController;
  /** Abandoned-login expiry (see `armLoginExpiry`); cleared when the flow settles. */
  timer?: ReturnType<typeof setTimeout>;
};

const active = new Map<ProviderId, LoginState>();

/**
 * Overall cap on an in-flight login. An abandoned flow is not just stale UI
 * state: the browser/loopback flows hold pi's in-process OAuth callback server
 * bound to the provider's FIXED port (Codex: 1455) until they settle, which
 * blocks every future sign-in for that provider MACHINE-WIDE — any other
 * Houston instance, and the desktop relay's own local bind, all need that
 * exact port. Matches the local client watcher's own 10-minute cap.
 */
export const LOGIN_TIMEOUT_MS = 10 * 60_000;

/**
 * Stable sentinel the frontend localizes for the failure toast. Mirrors
 * `PROVIDER_LOGIN_TIMEOUT_ERROR` in `@houston-ai/core` (ui/core/src/
 * provider-login.ts) — the runtime is frontend-agnostic and cannot import ui
 * packages, so the string is duplicated by value; keep the two in sync.
 */
export const LOGIN_TIMEOUT_ERROR = "Login timed out";

function clearLoginExpiry(state: LoginState): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = undefined;
}

/**
 * (Re)start the abandoned-login clock. On expiry the flow is torn down exactly
 * like `cancelLogin` (abort stops device-code pollers; the rejected paste
 * promise closes the loopback callback server and frees its port) but the
 * state stays in `active` as an ERROR, like any other failed login, so status
 * polls surface "Login timed out" instead of silently forgetting the attempt.
 * Re-armed when `startLogin` reuses an in-flight login, so every connect click
 * gets the full window.
 */
function armLoginExpiry(provider: ProviderId, state: LoginState): void {
  clearLoginExpiry(state);
  const timer = setTimeout(() => {
    // Stand down if the flow settled or was replaced/cancelled meanwhile.
    if (active.get(provider) !== state) return;
    if (state.status !== "starting" && state.status !== "awaiting_user") return;
    // Record the outcome BEFORE aborting: the login promise's rejection
    // handler sees the abort as a benign unwind and leaves this in place.
    state.status = "error";
    state.error = LOGIN_TIMEOUT_ERROR;
    console.error(
      `[oauth:${provider}] abandoned login timed out after ${LOGIN_TIMEOUT_MS / 60_000}min — aborting to free the callback port`,
    );
    state.abort?.abort();
    state.rejectPaste?.(new Error(LOGIN_TIMEOUT_ERROR));
    // The paste promise is dead: drop the hooks so a late completeLogin gets
    // a loud "no active login" instead of silently resolving into the void.
    state.resolvePaste = undefined;
    state.rejectPaste = undefined;
  }, LOGIN_TIMEOUT_MS);
  // Bookkeeping only — never hold the process open for it.
  timer.unref?.();
  state.timer = timer;
}

/**
 * Which Codex OAuth flow to run — decided SOLELY by `deviceAuth`. The
 * browser/loopback login (the user approves in their own browser, no code to
 * type) works even against a headless/remote runtime: pi's loginOpenAICodex
 * races its own local callback server against a manually-relayed code
 * (`onManualCodeInput`, wired below). The desktop client catches the fixed
 * `http://localhost:1455/auth/callback` redirect and relays code+state via
 * `completeLogin`, and the runtime performs the token exchange — so the loopback
 * never needs to be reachable from the runtime itself. `deviceAuth: false` is
 * only sent by clients that can catch/relay that loopback callback; everyone
 * else (a remote webapp, cloud OR self-host) sends `deviceAuth: true` and gets
 * the device-code grant, where the user types a one-time code while the runtime
 * polls.
 */
export function codexLoginMethod(opts: { deviceAuth: boolean }): string {
  return opts.deviceAuth
    ? OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD
    : OPENAI_CODEX_BROWSER_LOGIN_METHOD;
}

/**
 * Auto-answer for a provider's interactive text prompt (`onPrompt`), or null to
 * defer to the user. GitHub Copilot's pi-ai login OPENS with an optional
 * "GitHub Enterprise URL/domain" question before it emits the device code;
 * leaving it unanswered deadlocks the flow (the device code never appears). We
 * answer it programmatically: the company domain for an Enterprise connect, or
 * "" (=> github.com) for individual Copilot. Every other provider's `onPrompt`
 * is a manual code-paste that MUST wait for the user — those return null so the
 * caller hands back the paste promise.
 */
export function autoPromptAnswer(
  provider: string,
  enterpriseDomain?: string,
): string | null {
  return provider === "github-copilot" ? (enterpriseDomain ?? "") : null;
}

// A provider the connect flow will act on: a curated id OR any provider pi-ai
// knows. Widened via `isProvider` so a pasted key for an uncurated pi provider
// (e.g. groq) is accepted here; setApiKey's own `providerAuthMethod` check then
// confirms it is an api-key (not OAuth) provider before storing the key.
const known = (id: string): id is ProviderId => isProvider(id);

/** One /auth/status row for a provider id (curated or uncurated pi). */
function authStatusRow(id: ProviderId, name: string) {
  const st = active.get(id);
  // Copilot Enterprise: surface the connected credential's company domain so the
  // connect UI can tell the Enterprise card apart from individual Copilot (both
  // are the same engine provider; the domain is the only difference). `get` is
  // in-memory (pi caches auth.json), so this stays cheap per poll.
  const cred = authStorage.get(id) as { enterpriseUrl?: string } | undefined;
  return {
    provider: id,
    name,
    configured: providerConnected(authStorage, id),
    enterpriseUrl: cred?.enterpriseUrl ?? null,
    login: st ? { status: st.status, info: st.info, error: st.error } : null,
  };
}

export async function getAuthStatus() {
  // Live-refresh the anthropic shared-dir credential signal (Keychain / file,
  // scoped by the login config dir) so the first poll after a browser login
  // reads connected AND the sync turn-time path (`activeProvider` →
  // `providerConnected`) sees a warm cache. Never throws.
  await refreshAnthropicCredential();
  const providers = PROVIDERS.map((p) => authStatusRow(p.id, p.name));
  // Mirror listProviders: a connected uncurated pi provider (a pasted key for a
  // non-curated provider) also reports as configured here, so every status
  // surface agrees. Unconnected uncurated ids stay out (shape unchanged for the
  // common case); the frontend catalog supplies their display name.
  const curated = new Set(PROVIDERS.map((p) => p.id));
  for (const id of piProviderIds()) {
    if (!curated.has(id) && providerConnected(authStorage, id))
      providers.push(authStatusRow(id, id));
  }
  return { providers, activeProvider: activeProvider() };
}

// `deviceAuth` is the client's declaration that it CANNOT receive a loopback
// OAuth callback (a remote webapp). Defaults to true (the safe device-code path)
// so any caller that omits it never strands a remote user on an unreachable
// loopback; the co-located desktop app passes false to get the browser login.
export async function startLogin(
  providerId: string,
  deviceAuth = true,
  enterpriseDomain?: string,
): Promise<LoginInfo> {
  if (!known(providerId)) throw new Error(`unknown provider: ${providerId}`);
  if (providerAuthMethod(providerId) !== "oauth")
    throw new Error(`${providerId} does not use OAuth sign-in`);
  const provider = providerId;

  // The OpenAI/Codex browser (loopback) login makes pi bind a FIXED loopback
  // callback port (1455) in-process — and pi swallows an EADDRINUSE, stranding
  // the flow (a browser opens, the user approves, the redirect lands on whoever
  // holds the port, and Houston spins the whole 10-min window). Probe that exact
  // port FIRST so a real Codex CLI / stray login becomes an instant, actionable
  // error before any browser opens. Throwing here — BEFORE any state is added to
  // `active` or the expiry armed — leaves the slot free for an immediate retry.
  // The device-code path (deviceAuth) and every other provider bind nothing.
  if (
    provider === "openai-codex" &&
    codexLoginMethod({ deviceAuth }) === OPENAI_CODEX_BROWSER_LOGIN_METHOD
  ) {
    await preflightCodexCallbackPort();
  }

  // Idempotent: reuse an in-flight login (Anthropic's loopback only binds once).
  const existing = active.get(provider);
  if (
    existing &&
    (existing.status === "starting" || existing.status === "awaiting_user") &&
    existing.info
  ) {
    // A fresh connect click deserves the full abandonment window.
    armLoginExpiry(provider, existing);
    return existing.info;
  }

  const state: LoginState = {
    status: "starting",
    abort: new AbortController(),
  };
  active.set(provider, state);
  armLoginExpiry(provider, state);

  let resolveInfo!: (i: LoginInfo) => void;
  const infoReady = new Promise<LoginInfo>((r) => (resolveInfo = r));
  const pastePromise = new Promise<string>((resolve, reject) => {
    state.resolvePaste = resolve;
    state.rejectPaste = reject;
  });
  // Only the loopback flows consume the paste promise (onPrompt /
  // onManualCodeInput); cancelling a device-code login rejects it with no
  // consumer, which must not crash the process as an unhandled rejection.
  pastePromise.catch(() => {});

  // Anthropic uses the sanctioned setup-token flow (the direct OAuth replay is
  // server-blocked), NOT pi's AuthStorage login. It emits the same `auth_code`
  // wire shape and reuses the paste promise, then stores the captured token as an
  // api_key credential — see auth/anthropic-setup-token.ts.
  const login: Promise<unknown> =
    provider === "anthropic"
      ? runAnthropicSetupTokenLogin(
          {
            onAuth: ({ url, instructions }) => {
              state.info = { kind: "auth_code", url, instructions };
              state.status = "awaiting_user";
              resolveInfo(state.info);
            },
            onManualCodeInput: () => pastePromise,
          },
          {
            store: (key) =>
              authStorage.set("anthropic", { type: "api_key", key }),
          },
        )
      : authStorage.login(provider, {
          onAuth: ({ url, instructions }) => {
            // A provider with no loopback server can't catch a redirect — the
            // user must paste the code back. Signal that to the webapp with
            // `auth_code` so it shows a paste box.
            const needsCode =
              getOAuthProvider(provider)?.usesCallbackServer === false;
            state.info = needsCode
              ? { kind: "auth_code", url, instructions }
              : { kind: "url", url };
            state.status = "awaiting_user";
            resolveInfo(state.info);
          },
          onDeviceCode: (info: OAuthDeviceCodeInfo) => {
            state.info = {
              kind: "device_code",
              verificationUri: info.verificationUri,
              userCode: info.userCode,
            };
            state.status = "awaiting_user";
            resolveInfo(state.info);
          },
          // Codex offers browser (loopback) or device-code login; let the client
          // pick so the co-located desktop redirects to the browser to approve
          // and remote webapp clients type a code (see codexLoginMethod).
          onSelect: async () => codexLoginMethod({ deviceAuth }),
          onPrompt: () => {
            const auto = autoPromptAnswer(provider, enterpriseDomain);
            return auto === null ? pastePromise : Promise.resolve(auto);
          },
          onManualCodeInput: () => pastePromise,
          onProgress: (m: string) => console.log(`[oauth:${provider}]`, m),
          signal: state.abort?.signal,
        });

  void login
    .then(() => {
      clearLoginExpiry(state);
      state.status = "complete";
      console.log(`[oauth:${provider}] login complete`);
    })
    .catch((e: unknown) => {
      clearLoginExpiry(state);
      if (state.abort?.signal.aborted) {
        // The flow unwinding after a user-initiated cancel (cancelLogin
        // already dropped the state from `active`) or the abandoned-login
        // expiry (which already recorded its error) — not a new failure.
        console.log(`[oauth:${provider}] login flow closed`);
        return;
      }
      state.status = "error";
      state.error = e instanceof Error ? e.message : String(e);
      console.error(`[oauth:${provider}] failed:`, state.error);
    });

  return Promise.race([
    infoReady,
    new Promise<LoginInfo>((_, rej) =>
      setTimeout(
        () => rej(new Error(`timed out starting ${provider} login`)),
        15_000,
      ),
    ),
  ]);
}

/**
 * Store a pasted API key for an api-key provider. pi's
 * AuthStorage persists it as the `api_key` credential variant; `getApiKey`
 * then returns it for any `getModel(provider, ...)` call against the provider's
 * built-in OpenAI-compatible gateway. There is no OAuth dance and nothing to
 * refresh or scrub.
 */
export function setApiKey(providerId: string, key: string): void {
  const trimmed = assertApiKeyConnectable(providerId, key);
  authStorage.set(providerId, { type: "api_key", key: trimmed });
  const state = active.get(providerId as ProviderId);
  if (state) clearLoginExpiry(state);
  active.delete(providerId as ProviderId);
}

/**
 * The cheap, offline preconditions of an API-key connect (known provider,
 * api-key auth method, non-empty key) — split out so the connect route can
 * fail fast on these BEFORE spending a live verification request
 * (`verifyApiKey`). Returns the trimmed key.
 */
export function assertApiKeyConnectable(providerId: string, key: string) {
  if (!known(providerId)) throw new Error(`unknown provider: ${providerId}`);
  if (providerAuthMethod(providerId) !== "apiKey")
    throw new Error(`${providerId} does not connect with a pasted API key`);
  const trimmed = key.trim();
  if (!trimmed) throw new Error("missing API key");
  return trimmed;
}

/**
 * Placeholder key for keyless local servers. Ollama / LM Studio / vLLM ignore
 * the Authorization header, but pi requires SOME key to resolve a request (it
 * throws "No API key for provider" otherwise), so a blank key becomes this.
 */
export const LOCAL_PLACEHOLDER_KEY = "houston-local";

/**
 * Connect an OpenAI-compatible (local) server: persist its base URL + model (and
 * display options) and store the optional key in auth.json — a placeholder when
 * the server is keyless. LOCAL profile only; the host gates this on its
 * capability, never serving it from a cloud runtime that can't reach localhost.
 */
export function setCustomEndpoint(
  input: CustomEndpointInput & { apiKey?: string },
): void {
  // Validate + persist the endpoint FIRST so a bad URL never leaves a stale key.
  setCustomEndpointConfig(input);
  const key = input.apiKey?.trim() || LOCAL_PLACEHOLDER_KEY;
  authStorage.set(OPENAI_COMPATIBLE, { type: "api_key", key });
}

/**
 * Cancel an in-flight OAuth login for real — not just the client's spinner.
 * Two teardown paths cover every flow pi runs:
 * - aborting the signal stops the device-code pollers (Codex device, Copilot);
 * - rejecting the paste promise unwinds the loopback flows (Anthropic, Codex
 *   browser): their onManualCodeInput rejection handler calls cancelWait(),
 *   which closes the callback server and frees the port for a retry.
 * Dropping the state from `active` immediately frees the slot, so a retried
 * startLogin never collides with the cancelled one ("sign-in already pending",
 * the HOU-438 failure class). Cancelling when nothing is in flight is benign.
 */
export function cancelLogin(providerId: string): void {
  if (!known(providerId)) throw new Error(`unknown provider: ${providerId}`);
  const state = active.get(providerId);
  if (!state || state.status === "complete") return;
  active.delete(providerId);
  clearLoginExpiry(state);
  state.abort?.abort();
  state.rejectPaste?.(new Error("login cancelled"));
}

/** Paste-code completion (Anthropic remote path). */
export function completeLogin(providerId: string, code: string): void {
  const state = active.get(providerId as ProviderId);
  if (!state?.resolvePaste)
    throw new Error(`no active login for ${providerId}`);
  state.resolvePaste(code);
}

export async function logout(providerId: string): Promise<void> {
  if (!known(providerId)) throw new Error(`unknown provider: ${providerId}`);
  authStorage.logout(providerId);
  const state = active.get(providerId);
  if (state) clearLoginExpiry(state);
  active.delete(providerId);
  // Anthropic's primary credential is the browser-login one cached in the shared
  // dir (Keychain / file), NOT auth.json — so clear it via `claude auth logout`
  // and reset the probe cache, else the card would re-read connected on the next
  // poll. `authStorage.logout` above still clears the degraded fallback token.
  if (providerId === "anthropic") await logoutAnthropicCredential();
  // Disconnecting the local provider also forgets its endpoint, else the next
  // turn would re-resolve a base URL with no (real) key behind it.
  if (providerId === OPENAI_COMPATIBLE) clearCustomEndpointConfig();
}
