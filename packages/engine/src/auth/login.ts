import { getOAuthProvider } from "@earendil-works/pi-ai/oauth";
import type { LoginInfo } from "@houston/engine-client";
import { authStorage } from "./storage";
import { PROVIDERS, activeProvider, type ProviderId } from "../ai/providers";

/**
 * Multi-provider OAuth login, driven server-side and relayed to the webapp.
 *
 * - anthropic (Claude): PKCE. Locally the loopback (127.0.0.1:53692) catches the
 *   redirect (`url`). Headless, the user pastes the code Claude shows (`auth_code`
 *   + completeLogin) — see auth/anthropic-headless.ts.
 * - openai-codex (ChatGPT/Codex): device code — user enters a code on their own
 *   device while the engine polls. Fully headless.
 */

type LoginState = {
  status: "starting" | "awaiting_user" | "complete" | "error";
  info?: LoginInfo;
  error?: string;
  resolvePaste?: (code: string) => void;
};

const OPENAI_DEVICE_CODE = "device_code";
const active = new Map<ProviderId, LoginState>();

const known = (id: string): id is ProviderId => PROVIDERS.some((p) => p.id === id);

export function getAuthStatus() {
  return {
    providers: PROVIDERS.map((p) => {
      const st = active.get(p.id);
      return {
        provider: p.id,
        name: p.name,
        configured: authStorage.hasAuth(p.id),
        login: st ? { status: st.status, info: st.info, error: st.error } : null,
      };
    }),
    activeProvider: activeProvider(),
  };
}

export async function startLogin(providerId: string): Promise<LoginInfo> {
  if (!known(providerId)) throw new Error(`unknown provider: ${providerId}`);
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
        const needsCode = getOAuthProvider(provider)?.usesCallbackServer === false;
        state.info = needsCode ? { kind: "auth_code", url, instructions } : { kind: "url", url };
        state.status = "awaiting_user";
        resolveInfo(state.info);
      },
      onDeviceCode: (info: any) => {
        state.info = {
          kind: "device_code",
          verificationUri: info.verificationUri,
          userCode: info.userCode,
        };
        state.status = "awaiting_user";
        resolveInfo(state.info);
      },
      onSelect: async () => OPENAI_DEVICE_CODE, // codex: force the headless device-code path
      onPrompt: () => pastePromise,
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
      setTimeout(() => rej(new Error(`timed out starting ${provider} login`)), 15_000),
    ),
  ]);
}

/** Paste-code completion (Anthropic remote path). */
export function completeLogin(providerId: string, code: string): void {
  const state = active.get(providerId as ProviderId);
  if (!state?.resolvePaste) throw new Error(`no active login for ${providerId}`);
  state.resolvePaste(code);
}

export function logout(providerId: string): void {
  if (!known(providerId)) throw new Error(`unknown provider: ${providerId}`);
  authStorage.logout(providerId);
  active.delete(providerId);
}
