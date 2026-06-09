import { authStorage } from "./storage";
import { config } from "../config";
import { PROVIDERS, activeProvider, type ProviderId } from "../ai/providers";

/**
 * Cloud sandboxes are keyless and never do interactive OAuth: the control plane
 * provisions the sandbox token at spawn. So in cloud mode the login routes are
 * dead — they throw this, which the HTTP layer surfaces as a 400 (never a silent
 * no-op).
 */
const CLOUD_LOGIN_DISABLED =
  "Interactive login is disabled in cloud mode; this agent authenticates through the control plane proxy.";

/** Has the control plane handed this sandbox a usable keyless credential? */
function cloudConnected(): boolean {
  return config.cloud && !!config.proxyBaseUrl && !!config.sandboxToken;
}

/**
 * Multi-provider OAuth login, driven server-side and relayed to the webapp.
 *
 * - anthropic (Claude): PKCE. Locally the loopback (127.0.0.1:53692) catches the
 *   redirect; remotely the user pastes the code (completeLogin).
 * - openai-codex (ChatGPT/Codex): device code — user enters a code on their own
 *   device while the runtime polls. Fully headless.
 */

export type LoginInfo =
  | { kind: "url"; url: string }
  | { kind: "device_code"; verificationUri: string; userCode: string };

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
  // Cloud mode: report the cloud provider as connected from the injected keyless
  // creds, with no OAuth login state. There is no auth.json and no login flow.
  if (config.cloud) {
    const connected = cloudConnected();
    return {
      providers: PROVIDERS.map((p) => ({
        provider: p.id,
        name: p.name,
        configured: connected && p.id === config.cloudProvider,
        login: null,
      })),
      activeProvider: connected ? (config.cloudProvider as ProviderId) : null,
    };
  }

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
  if (config.cloud) throw new Error(CLOUD_LOGIN_DISABLED);
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
      onAuth: ({ url }) => {
        state.info = { kind: "url", url };
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
  if (config.cloud) throw new Error(CLOUD_LOGIN_DISABLED);
  const state = active.get(providerId as ProviderId);
  if (!state?.resolvePaste) throw new Error(`no active login for ${providerId}`);
  state.resolvePaste(code);
}

export function logout(providerId: string): void {
  if (config.cloud) throw new Error(CLOUD_LOGIN_DISABLED);
  if (!known(providerId)) throw new Error(`unknown provider: ${providerId}`);
  authStorage.logout(providerId);
  active.delete(providerId);
}
