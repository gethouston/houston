import { authStorage } from "./storage";

/**
 * Drives the Anthropic (Claude Pro/Max) OAuth flow server-side.
 *
 * Locally, pi's loginAnthropic starts a loopback callback server on
 * 127.0.0.1:53692; the user authorizes in their browser and the redirect is
 * caught in-process — no paste-code needed. For a remote/cloud engine the
 * loopback is unreachable, so we also wire the paste-code path
 * (onManualCodeInput) which is resolved by completeAnthropicLogin().
 */

type LoginState = {
  url?: string;
  status: "starting" | "awaiting_user" | "complete" | "error";
  error?: string;
  resolvePaste?: (code: string) => void;
};

let active: LoginState | null = null;

export function getAuthStatus() {
  return {
    anthropicConfigured: authStorage.hasAuth("anthropic"),
    login: active
      ? { status: active.status, url: active.url, error: active.error }
      : null,
  };
}

export async function startAnthropicLogin(): Promise<{ url: string }> {
  // Idempotent: if a login is already awaiting the user, reuse it (the loopback
  // server is already bound to :53692, so a second login would EADDRINUSE).
  if (
    active &&
    (active.status === "starting" || active.status === "awaiting_user") &&
    active.url
  ) {
    return { url: active.url };
  }

  const state: LoginState = { status: "starting" };
  active = state;

  let resolveUrl!: (u: string) => void;
  const urlReady = new Promise<string>((r) => (resolveUrl = r));
  const pastePromise = new Promise<string>((r) => (state.resolvePaste = r));

  // login() runs the flow and persists {type:"oauth", ...} on success.
  void authStorage
    .login("anthropic", {
      onAuth: ({ url }) => {
        state.url = url;
        state.status = "awaiting_user";
        resolveUrl(url);
      },
      onDeviceCode: () => {},
      onSelect: async () => undefined,
      onPrompt: () => pastePromise,
      onManualCodeInput: () => pastePromise,
      onProgress: (m: string) => console.log("[oauth:anthropic]", m),
    })
    .then(() => {
      state.status = "complete";
      console.log("[oauth:anthropic] login complete");
    })
    .catch((e: unknown) => {
      state.status = "error";
      state.error = e instanceof Error ? e.message : String(e);
      console.error("[oauth:anthropic] login failed:", state.error);
    });

  const url = await Promise.race([
    urlReady,
    new Promise<string>((_, rej) =>
      setTimeout(() => rej(new Error("timed out starting Anthropic login")), 10_000),
    ),
  ]);
  return { url };
}

/** Paste-code completion (cloud path). No-op locally where loopback wins. */
export function completeAnthropicLogin(code: string): void {
  if (!active?.resolvePaste) throw new Error("no active Anthropic login");
  active.resolvePaste(code);
}

export function logoutAnthropic(): void {
  authStorage.logout("anthropic");
  active = null;
}
