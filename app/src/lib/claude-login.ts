import {
  type ClaudeLoginDone,
  classifyClaudeLoginFailure,
} from "./claude-login-failure";
import {
  fallbackToPaste,
  finishRemoteClaudeLogin,
} from "./claude-login-remote";
import { isRemoteEngine } from "./engine";
import { showConnectivityErrorToast } from "./error-toast";
import { publishLocalHoustonEvent } from "./events";
import i18n from "./i18n";
import {
  legacyListen,
  osCancelClaudeLogin,
  osStartClaudeLogin,
} from "./os-bridge";
import { tauriProvider } from "./tauri";

const CLAUDE_LOGIN_DONE_EVENT = "claude-login://done";

const LOGIN_TIMEOUT_MS = 15 * 60_000;

const CONFIRM_TIMEOUT_MS = 30_000;
const CONFIRM_POLL_MS = 800;

function announce(provider: string, success: boolean, error: string | null) {
  publishLocalHoustonEvent({
    type: "ProviderLoginComplete",
    data: { provider, success, error },
  });
}

let activeCancel: (() => void) | null = null;

export function cancelClaudeBrowserLogin(frontendProviderId: string): void {
  if (!activeCancel) return;
  void osCancelClaudeLogin();
  activeCancel();
  announce(frontendProviderId, false, null);
}

async function confirmConnected(provider: string): Promise<boolean> {
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const status = await tauriProvider.checkStatus(provider);
      if (status.authenticated) return true;
    } catch (err) {
      console.warn("[claude-login] status probe failed:", err);
    }
    await new Promise((r) => setTimeout(r, CONFIRM_POLL_MS));
  }
  return false;
}

export async function beginClaudeBrowserLogin(
  frontendProviderId: string,
): Promise<void> {
  const handoff = isRemoteEngine();
  let unlisten: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  const cleanup = () => {
    settled = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
    if (activeCancel === cleanup) activeCancel = null;
  };

  if (activeCancel) return;
  activeCancel = cleanup;

  try {
    unlisten = await legacyListen<ClaudeLoginDone>(
      CLAUDE_LOGIN_DONE_EVENT,
      (ev) => {
        if (settled) return;
        cleanup();
        const { success, error } = ev.payload;
        if (!success) {
          const route = classifyClaudeLoginFailure(ev.payload, handoff);
          switch (route.kind) {
            case "paste-fallback":
              fallbackToPaste(frontendProviderId, route.reason, announce);
              break;
            case "helper-unsupported":
              announce(
                frontendProviderId,
                false,
                i18n.t("providers:claudeLogin.helperUnsupported"),
              );
              break;
            case "shell-unavailable":
              announce(
                frontendProviderId,
                false,
                i18n.t("providers:claudeLogin.shellUnavailable"),
              );
              break;
            case "offline":
              showConnectivityErrorToast("claude_login", route.error);
              announce(frontendProviderId, false, null);
              break;
            default:
              announce(frontendProviderId, false, error);
          }
          return;
        }
        if (handoff) {
          void finishRemoteClaudeLogin(
            frontendProviderId,
            confirmConnected,
            announce,
          );
          return;
        }
        void confirmConnected(frontendProviderId).then((ok) => {
          announce(
            frontendProviderId,
            ok,
            ok ? null : i18n.t("providers:claudeLogin.confirmTimeout"),
          );
        });
      },
    );
  } catch (err) {
    cleanup();
    announce(
      frontendProviderId,
      false,
      err instanceof Error ? err.message : String(err),
    );
    return;
  }

  timer = setTimeout(() => {
    if (settled) return;
    cleanup();
    announce(
      frontendProviderId,
      false,
      i18n.t("providers:claudeLogin.timeout"),
    );
  }, LOGIN_TIMEOUT_MS);

  try {
    await osStartClaudeLogin(handoff);
  } catch (err) {
    if (settled) return;
    cleanup();
    announce(
      frontendProviderId,
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
}
