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
 * TOPOLOGY: the SAME browser login runs on this machine for both a co-located
 * and a remote engine (`shouldUseClaudeDesktopLogin` is now any Tauri desktop).
 * What differs is WHERE the credential is minted and what happens AFTER
 * `claude-login://done` with success:
 *   * CO-LOCATED — the login caches into the shared dir the local runtime
 *     reads, so we only poll until the runtime reads it connected. That
 *     credential's refresh-token family stays local: the CLI is its only
 *     rotator, and it is NEVER pushed anywhere.
 *   * REMOTE (hosted pod) — the pod can't read this machine's Keychain, so the
 *     login mints into a throwaway HANDOFF dir, we EXTRACT the credential and
 *     PUSH it to the pod (see `claude-login-remote.ts`), destroy the local
 *     copy, then poll. From the push on, the gateway is that family's ONLY
 *     rotator (HOU-950 — a second rotator trips Anthropic's refresh-token-reuse
 *     detection and revokes the family, signing the user out everywhere). Any
 *     failure degrades to the setup-token paste flow, never a dead spinner.
 *
 * Each space the user connects therefore gets its OWN freshly minted token
 * family. There is deliberately NO path that seeds a space from a cached
 * credential snapshot: the old background reconcile did exactly that and was
 * how one family ended up behind several rotating stores (HOU-950 root cause).
 */

import {
  type ClaudeLoginDone,
  classifyClaudeLoginFailure,
} from "./claude-login-failure";
import {
  fallbackToPaste,
  finishRemoteClaudeLogin,
} from "./claude-login-remote";
import { isRemoteEngine } from "./engine";
import { publishLocalHoustonEvent } from "./events";
import i18n from "./i18n";
import {
  legacyListen,
  osCancelClaudeLogin,
  osStartClaudeLogin,
} from "./os-bridge";
import { tauriProvider } from "./tauri";

/** Native event carrying the login result `{ success, error }`. */
const CLAUDE_LOGIN_DONE_EVENT = "claude-login://done";

/** Overall guard: the user may sit on the Claude consent screen for a while.
 * Mirrors the native helper's `LOGIN_TIMEOUT` (claude_login/runner.rs) — kill
 * the CLI early and its local listener dies, forcing the approval page onto
 * its show-a-code fallback for late approvers (HOU-839). */
const LOGIN_TIMEOUT_MS = 15 * 60_000;

/** After `done: success`, how long to wait for the engine to read the fresh
 *  credential as connected (the /providers probe re-reads `claude auth status`). */
const CONFIRM_TIMEOUT_MS = 30_000;
const CONFIRM_POLL_MS = 800;

/** Announce the outcome on the client bus so every provider surface reacts. */
function announce(provider: string, success: boolean, error: string | null) {
  publishLocalHoustonEvent({
    type: "ProviderLoginComplete",
    data: { provider, success, error },
  });
}

/**
 * The single in-flight browser login's teardown, or null when none is running.
 * Claude's `claude auth login` binds a loopback and this module keeps one raw
 * `done` listener per attempt, so two concurrent attempts would race two
 * loopbacks and fire conflicting completions. We enforce single-flight: a new
 * login (or an explicit cancel) tears the previous one down first.
 */
let activeCancel: (() => void) | null = null;

/**
 * Cancel the in-flight desktop Claude login, if any: kill the native `claude`
 * child (its `done { success:false, error:null }` unwinds the listener) and clear
 * the pending card silently. Routed here from `cancelLogin` for anthropic on the
 * desktop — the runtime never ran this login, so its own cancel is a no-op. Safe
 * to call with nothing in flight.
 */
export function cancelClaudeBrowserLogin(frontendProviderId: string): void {
  if (!activeCancel) return;
  void osCancelClaudeLogin();
  activeCancel();
  announce(frontendProviderId, false, null);
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
  // Pinned for the whole attempt: it decides the mint dir (handoff vs the
  // engine-shared one) AND the completion branch, and those must agree even if
  // the engine target were to change mid-login.
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

  // Single-flight by IGNORING re-entry: if a login is already in flight, a
  // second Connect click is a no-op (the "approve in your browser" dialog is
  // already up). Superseding instead would register a new listener that then
  // catches the OLD child's kill-`done` (the events carry no attempt id) and
  // self-cancel the retry. A stuck login is freed by Cancel or the 5-min
  // timeout, then a fresh Connect proceeds. The Rust `start_claude_login` still
  // kills any prior child as a backstop.
  if (activeCancel) return;
  activeCancel = cleanup;

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
          // The browser login failed before any remote handoff: declined,
          // cancelled (silent), or the helper binary can't run on this
          // machine at all — the router decides which surface each gets.
          const route = classifyClaudeLoginFailure(ev.payload, handoff);
          switch (route.kind) {
            case "paste-fallback":
              // The paste flow runs in the remote runtime; no local helper
              // needed (HOUSTON-APP-543: pre-AVX2 Macs SIGILL the helper).
              fallbackToPaste(frontendProviderId, route.reason, announce);
              break;
            case "helper-unsupported":
              announce(
                frontendProviderId,
                false,
                i18n.t("providers:claudeLogin.helperUnsupported"),
              );
              break;
            default:
              announce(frontendProviderId, false, error);
          }
          return;
        }
        if (handoff) {
          // Remote pod: extract the handoff-dir cred + push it (the local copy
          // is destroyed after the push settles), then confirm. Guarantees
          // fallback-to-paste on any failure inside.
          void finishRemoteClaudeLogin(
            frontendProviderId,
            confirmConnected,
            announce,
          );
          return;
        }
        // Co-located: the runtime already reads the shared dir; just confirm.
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
