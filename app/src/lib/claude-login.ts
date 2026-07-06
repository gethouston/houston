/**
 * Desktop Claude/Anthropic browser sign-in — the zero-terminal connect.
 *
 * Unlike the Codex relay (which binds a loopback and relays a code), Claude's
 * own `claude auth login` runs its ENTIRE flow on this machine: the native
 * `start_claude_login` command spawns the bundled `claude`, which opens the
 * browser, catches its own callback, and caches the credential in Houston's
 * shared login dir — the same `CLAUDE_CONFIG_DIR` the engine reads. So there is
 * no code to relay and no runtime round-trip: the sign-in completes locally.
 *
 * Because it completes locally, there is no server `ProviderLoginComplete` to
 * ride. We synthesize one on the client bus (`publishLocalHoustonEvent`) once we
 * confirm the engine now reads the credential as connected, so every provider
 * surface (settings, picker, onboarding, reconnect card) reacts EXACTLY as it
 * does for a normal OAuth completion — flips the card, toasts, clears pending.
 *
 * SEAM for the hosted-cloud follow-up: this path assumes a CO-LOCATED engine
 * (the credential the desktop just cached is the very dir the local runtime
 * reads). A REMOTE engine (hosted pod) can't read this machine's Keychain, so a
 * later element must, after `claude-login://done` with success, EXTRACT the cred
 * (`<claudeLoginConfigDir>/.credentials.json` on Linux, or the macOS Keychain
 * item `security find-generic-password -s "Claude Code-credentials"`) and PUSH
 * it to the pod. The local-vs-remote branch point is `isCoLocatedEngine()` in
 * `shouldUseClaudeDesktopLogin` (provider-login-url.ts): remote-engine desktop
 * keeps the setup-token paste flow until that element lands. See TODO below.
 */

import { publishLocalHoustonEvent } from "./events";
import i18n from "./i18n";
import { legacyListen, osStartClaudeLogin } from "./os-bridge";
import { tauriProvider } from "./tauri";

/** Native event carrying the login result `{ success, error }`. */
const CLAUDE_LOGIN_DONE_EVENT = "claude-login://done";

/** Overall guard: the user may sit on the Claude consent screen for a while. */
const LOGIN_TIMEOUT_MS = 5 * 60_000;

/** After `done: success`, how long to wait for the engine to read the fresh
 *  credential as connected (the /providers probe re-reads `claude auth status`). */
const CONFIRM_TIMEOUT_MS = 30_000;
const CONFIRM_POLL_MS = 800;

interface ClaudeLoginDone {
  success: boolean;
  error: string | null;
}

/** Announce the outcome on the client bus so every provider surface reacts. */
function announce(provider: string, success: boolean, error: string | null) {
  publishLocalHoustonEvent({
    type: "ProviderLoginComplete",
    data: { provider, success, error },
  });
}

/** Poll the engine until anthropic reads connected (the fresh credential is
 *  visible to the runtime's status probe), or the confirm window elapses. */
async function confirmConnected(provider: string): Promise<boolean> {
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const status = await tauriProvider.checkStatus(provider);
      if (status.authenticated) return true;
    } catch (err) {
      // A transient probe failure is not terminal — keep polling until the
      // window elapses; the final `announce(false)` surfaces a real timeout.
      console.warn("[claude-login] status probe failed:", err);
    }
    await new Promise((r) => setTimeout(r, CONFIRM_POLL_MS));
  }
  return false;
}

/**
 * Drive the desktop Claude browser sign-in end to end. Resolves once the flow
 * has STARTED (the native helper spawned); the outcome arrives asynchronously as
 * a synthetic `ProviderLoginComplete`. Never rejects — every failure path
 * (spawn error, non-zero exit, timeout, or a success the engine couldn't
 * confirm) is reported through that event so the surfaces toast + clear pending
 * uniformly. A benign cancel (`error: null`) clears pending with no toast.
 */
export async function beginClaudeBrowserLogin(
  frontendProviderId: string,
): Promise<void> {
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
  };

  // Register the `done` listener BEFORE invoking so a fast completion can't race
  // ahead of us. The result rides a raw Tauri event (`claude-login://done`), the
  // same channel the native command emits on.
  try {
    unlisten = await legacyListen<ClaudeLoginDone>(
      CLAUDE_LOGIN_DONE_EVENT,
      (ev) => {
        if (settled) return;
        cleanup();
        const { success, error } = ev.payload;
        if (!success) {
          // TODO(cloud): a future hosted-engine element extracts + pushes the
          // credential here when isCoLocatedEngine() is false. Local path stops.
          announce(frontendProviderId, false, error);
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
    await osStartClaudeLogin();
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
