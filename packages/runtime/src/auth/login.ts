import {
  getOAuthProvider,
  type OAuthDeviceCodeInfo,
  OPENAI_CODEX_BROWSER_LOGIN_METHOD,
  OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD,
} from "@earendil-works/pi-ai/oauth";
import type { LoginInfo } from "@houston/runtime-client";
import {
  activeProvider,
  PROVIDERS,
  type ProviderId,
  providerAuthMethod,
} from "../ai/providers";
import { config } from "../config";
import { authStorage } from "./storage";

/**
 * Multi-provider OAuth login, driven server-side and relayed to the webapp.
 *
 * - anthropic (Claude): PKCE. Locally the loopback (127.0.0.1:53692) catches the
 *   redirect (`url`). Headless, the user pastes the code Claude shows (`auth_code`
 *   + completeLogin) — see auth/anthropic-headless.ts.
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
};

const active = new Map<ProviderId, LoginState>();

/**
 * Which Codex OAuth flow to run. The browser/loopback login (the user approves
 * in their own browser, the localhost callback finishes it, no code to type) is
 * used ONLY when the client is co-located: it asked for it (`deviceAuth: false`,
 * which only the desktop app sends — `!osIsTauri()`) AND this runtime can host a
 * loopback callback the browser actually reaches (`!headless`). Otherwise the
 * device-code grant, where the user enters a one-time code while the runtime
 * polls. `deviceAuth` is the load-bearing signal — a remote webapp (cloud OR
 * self-host) sends `deviceAuth: true` and gets the device code regardless of how
 * the runtime binds; `headless` only guards the exotic "desktop pointed at a
 * remote headless runtime" case where the loopback can't be reached.
 */
export function codexLoginMethod(opts: {
  deviceAuth: boolean;
  headless: boolean;
}): string {
  return !opts.deviceAuth && !opts.headless
    ? OPENAI_CODEX_BROWSER_LOGIN_METHOD
    : OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD;
}

/**
 * Auto-answer for a provider's interactive text prompt (`onPrompt`), or null to
 * defer to the user. GitHub Copilot's pi-ai login OPENS with an optional
 * "GitHub Enterprise URL/domain" question before it emits the device code;
 * leaving it unanswered deadlocks the flow (the device code never appears).
 * Houston serves individual Copilot accounts and the product voice forbids
 * surfacing enterprise jargon, so auto-answer "" (=> github.com). Every other
 * provider's `onPrompt` is the Anthropic headless code-paste, which MUST wait
 * for the user — those return null so the caller hands back the paste promise.
 */
export function autoPromptAnswer(provider: string): string | null {
  return provider === "github-copilot" ? "" : null;
}

const known = (id: string): id is ProviderId =>
  PROVIDERS.some((p) => p.id === id);

export function getAuthStatus() {
  return {
    providers: PROVIDERS.map((p) => {
      const st = active.get(p.id);
      return {
        provider: p.id,
        name: p.name,
        configured: authStorage.hasAuth(p.id),
        login: st
          ? { status: st.status, info: st.info, error: st.error }
          : null,
      };
    }),
    activeProvider: activeProvider(),
  };
}

// `deviceAuth` is the client's declaration that it CANNOT receive a loopback
// OAuth callback (a remote webapp). Defaults to true (the safe device-code path)
// so any caller that omits it never strands a remote user on an unreachable
// loopback; the co-located desktop app passes false to get the browser login.
export async function startLogin(
  providerId: string,
  deviceAuth = true,
): Promise<LoginInfo> {
  if (!known(providerId)) throw new Error(`unknown provider: ${providerId}`);
  if (providerAuthMethod(providerId) === "apiKey")
    throw new Error(
      `${providerId} connects with an API key, not OAuth sign-in`,
    );
  const provider = providerId;

  // Idempotent: reuse an in-flight login (Anthropic's loopback only binds once).
  const existing = active.get(provider);
  if (
    existing &&
    (existing.status === "starting" || existing.status === "awaiting_user") &&
    existing.info
  ) {
    return existing.info;
  }

  const state: LoginState = { status: "starting" };
  active.set(provider, state);

  let resolveInfo!: (i: LoginInfo) => void;
  const infoReady = new Promise<LoginInfo>((r) => (resolveInfo = r));
  const pastePromise = new Promise<string>((r) => (state.resolvePaste = r));

  void authStorage
    .login(provider, {
      onAuth: ({ url, instructions }) => {
        // A provider with no loopback server (the headless Claude flow) can't
        // catch a redirect — the user must paste the code back. Signal that to
        // the webapp with `auth_code` so it shows a paste box.
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
      // pick so the co-located desktop redirects to the browser to approve and
      // remote webapp clients type a code (see codexLoginMethod).
      onSelect: async () =>
        codexLoginMethod({ deviceAuth, headless: config.headless }),
      onPrompt: () => {
        const auto = autoPromptAnswer(provider);
        return auto === null ? pastePromise : Promise.resolve(auto);
      },
      onManualCodeInput: () => pastePromise,
      onProgress: (m: string) => console.log(`[oauth:${provider}]`, m),
    })
    .then(() => {
      state.status = "complete";
      console.log(`[oauth:${provider}] login complete`);
    })
    .catch((e: unknown) => {
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
 * Store a pasted API key for an api-key provider (OpenCode Zen / Go). pi's
 * AuthStorage persists it as the `api_key` credential variant; `getApiKey`
 * then returns it for any `getModel(provider, ...)` call against the provider's
 * built-in OpenAI-compatible gateway. There is no OAuth dance and nothing to
 * refresh or scrub.
 */
export function setApiKey(providerId: string, key: string): void {
  if (!known(providerId)) throw new Error(`unknown provider: ${providerId}`);
  if (providerAuthMethod(providerId) !== "apiKey")
    throw new Error(`${providerId} signs in with OAuth, not an API key`);
  const trimmed = key.trim();
  if (!trimmed) throw new Error("missing API key");
  authStorage.set(providerId, { type: "api_key", key: trimmed });
  active.delete(providerId as ProviderId);
}

/** Paste-code completion (Anthropic remote path). */
export function completeLogin(providerId: string, code: string): void {
  const state = active.get(providerId as ProviderId);
  if (!state?.resolvePaste)
    throw new Error(`no active login for ${providerId}`);
  state.resolvePaste(code);
}

export function logout(providerId: string): void {
  if (!known(providerId)) throw new Error(`unknown provider: ${providerId}`);
  authStorage.logout(providerId);
  active.delete(providerId);
}
