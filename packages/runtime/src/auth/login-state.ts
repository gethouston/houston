import type { LoginInfo } from "@houston/runtime-client";
import type { ProviderId } from "../ai/providers";
import { currentCredentialScope } from "../session/acting-context";
export type LoginState = {
  status: "starting" | "awaiting_user" | "complete" | "error";
  info?: LoginInfo;
  error?: string;
  resolvePaste?: (code: string) => void;
  rejectPaste?: (err: Error) => void;
  abort?: AbortController;
  timer?: ReturnType<typeof setTimeout>;
};

export const active = new Map<string, LoginState>();

export function activeKey(provider: ProviderId): string {
  return `${currentCredentialScope().key}:${provider}`;
}

export const LOGIN_TIMEOUT_MS = 10 * 60_000;

export const LOGIN_TIMEOUT_ERROR = "Login timed out";

export const COPILOT_NO_ACCESS_ERROR =
  "Your GitHub account doesn't have Copilot access yet. Enable GitHub Copilot on github.com (the Free plan works), then try connecting again.";

export function loginFailureMessage(provider: ProviderId, raw: string): string {
  if (
    provider === "github-copilot" &&
    (raw.includes("no_copilot_access") ||
      raw.includes("No access to GitHub Copilot"))
  )
    return COPILOT_NO_ACCESS_ERROR;
  return raw;
}

export function clearLoginExpiry(state: LoginState): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = undefined;
}

export function armLoginExpiry(provider: ProviderId, state: LoginState): void {
  clearLoginExpiry(state);
  const key = activeKey(provider);
  const timer = setTimeout(() => {
    if (active.get(key) !== state) return;
    if (state.status !== "starting" && state.status !== "awaiting_user") return;
    state.status = "error";
    state.error = LOGIN_TIMEOUT_ERROR;
    console.warn(
      `[oauth:${provider}] abandoned login timed out after ${LOGIN_TIMEOUT_MS / 60_000}min — aborting to free the callback port`,
    );
    state.abort?.abort();
    state.rejectPaste?.(new Error(LOGIN_TIMEOUT_ERROR));
    state.resolvePaste = undefined;
    state.rejectPaste = undefined;
  }, LOGIN_TIMEOUT_MS);
  timer.unref?.();
  state.timer = timer;
}

export function getLoginStatus(provider: string) {
  const state = active.get(activeKey(provider as ProviderId));
  return state
    ? { status: state.status, info: state.info, error: state.error }
    : null;
}
