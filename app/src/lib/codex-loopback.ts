/**
 * Codex/OpenAI (ChatGPT) desktop OAuth loopback relay.
 *
 * The runtime hands the frontend an authorize URL for Codex sign-in (see the
 * `deviceAuth:false` default in {@link tauri.launchLogin}). On desktop we don't
 * want the user to copy a device code: instead the native side binds its OWN
 * localhost listener (`start_codex_oauth_loopback`), we open the URL in the
 * user's browser, and when OpenAI redirects back the native `codex-oauth://
 * callback` event carries the raw `code=...&state=...` query string, which we
 * relay to the engine via `submitLoginCode` (pi accepts the string verbatim).
 *
 * This is used ONLY against a REMOTE engine (see `codexUsesLoopbackRelay`): the
 * loopback lives on the user's machine while pi's own 1455 is in the pod, so
 * the local bind can't collide. A co-located engine keeps pi's own browser flow.
 */

import { shouldUseCodexLoopback } from "../components/shell/provider-login-url";
import {
  fallBackToDeviceCode,
  relayCodexCode,
} from "./codex-loopback-failures";
import {
  legacyListen,
  osIsTauri,
  osOpenUrl,
  osStartCodexOauthLoopback,
} from "./os-bridge";

/** Native event carrying the OAuth redirect's raw `code=...&state=...` query. */
const CODEX_OAUTH_CALLBACK_EVENT = "codex-oauth://callback";

/**
 * Safety net for a callback that never arrives (the user abandons the browser
 * tab, or the native loopback server times out). The engine's
 * `ProviderLoginComplete(success:false)` surfaces the real failure to the user;
 * this timer only tears down our one-shot listener so it can't leak. Generous
 * because a user may sit on the OpenAI consent screen for a while.
 */
const CALLBACK_TIMEOUT_MS = 5 * 60_000;

type Unlisten = Awaited<ReturnType<typeof legacyListen>>;

/**
 * The armed relay attempt per provider, torn down by {@link
 * cancelCodexLoopback}. Without this, a CANCELLED sign-in left its callback
 * listener armed for the full 5-minute window: approving the abandoned
 * browser tab afterwards relayed a code into a login the engine no longer
 * held — a doomed "no active login" submit and a spurious error toast (or,
 * worse, an unwanted auto-restarted sign-in) for a flow the user gave up on.
 */
const activeLoopbackCleanups = new Map<string, () => void>();

/**
 * Tear down the armed loopback relay for a provider (listener + timeout), so
 * a late browser approval can't relay into a cancelled login. Called from
 * `cancelLogin`'s engine-call choke point; a no-op when nothing is armed.
 */
export function cancelCodexLoopback(frontendProviderId: string): void {
  activeLoopbackCleanups.get(frontendProviderId)?.();
}

/**
 * Drive the desktop Codex/OpenAI browser sign-in: listen for the loopback
 * callback, bind the native listener, open the authorize URL, and relay the
 * code back to the engine. On any setup failure it cleans up the listener and
 * falls back to the device-code sign-in (`fallBackToDeviceCode`) — a toast
 * only fires if that fallback fails too. Never leaves an orphaned listener on
 * any path (success, error, or timeout). Resolves once the browser has been
 * opened (the callback is handled asynchronously); never rejects.
 */
export async function beginCodexBrowserLogin(
  frontendProviderId: string,
  authorizeUrl: string,
): Promise<void> {
  let unlisten: Unlisten | null = null;
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
    // Only this attempt's own registration — a newer begin may have replaced it.
    if (activeLoopbackCleanups.get(frontendProviderId) === cleanup)
      activeLoopbackCleanups.delete(frontendProviderId);
  };
  activeLoopbackCleanups.set(frontendProviderId, cleanup);

  // Register the callback listener BEFORE binding the loopback so a fast
  // redirect can't race ahead of us.
  try {
    unlisten = await legacyListen<string>(CODEX_OAUTH_CALLBACK_EVENT, (ev) => {
      if (settled) return;
      cleanup();
      void relayCodexCode(frontendProviderId, ev.payload);
    });
  } catch (err) {
    cleanup();
    await fallBackToDeviceCode(frontendProviderId, err);
    return;
  }

  timer = setTimeout(cleanup, CALLBACK_TIMEOUT_MS);

  try {
    await osStartCodexOauthLoopback();
    await osOpenUrl(authorizeUrl);
  } catch (err) {
    cleanup();
    await fallBackToDeviceCode(frontendProviderId, err);
  }
}

/**
 * Shared `ProviderLoginUrl` relay branch for every login surface (picker, AI
 * hub, onboarding, shell fallback). Reads the topology (`shouldUseCodexLoopback`
 * → `codexUsesLoopbackRelay`) and, when a Codex/OpenAI sign-in on a REMOTE-engine
 * desktop qualifies, drives {@link beginCodexBrowserLogin} and returns `true` so
 * the caller RETURNS before its own open-in-browser / device-code decision. Any
 * other case (co-located desktop, device code pending, non-openai, web) returns
 * `false` and the caller keeps its existing path. Centralized so the critical
 * "relay first" ordering isn't copy-pasted — and can't drift — across surfaces.
 */
export function tryBeginCodexLoopbackLogin(ev: {
  provider: string;
  url: string;
  userCode: string | null | undefined;
}): boolean {
  if (
    !shouldUseCodexLoopback({
      provider: ev.provider,
      env: (import.meta.env ?? {}) as {
        VITE_NEW_ENGINE_URL?: string;
        VITE_HOSTED_ENGINE_URL?: string;
      },
      isTauri: osIsTauri(),
      userCode: ev.userCode,
    })
  ) {
    return false;
  }
  // Codex/OpenAI against a REMOTE engine on desktop: bind our OWN local
  // 127.0.0.1:1455 listener and relay the callback code, so ChatGPT sign-in
  // works with zero device code. pi's 1455 is in the pod, so no collision.
  // beginCodexBrowserLogin falls back to the device-code sign-in when the
  // relay can't run and never leaves an orphaned listener.
  void beginCodexBrowserLogin(ev.provider, ev.url);
  return true;
}
