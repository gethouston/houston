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
 * This works even when the engine is REMOTE — the loopback lives on the user's
 * machine, so co-location with the engine is irrelevant.
 */

import { useUIStore } from "../stores/ui";
import i18n from "./i18n";
import {
  legacyListen,
  osOpenUrl,
  osStartCodexOauthLoopback,
} from "./os-bridge";
import { PROVIDERS } from "./providers";
import { tauriProvider } from "./tauri";

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

/** Reuse the existing "couldn't open sign-in" toast key with the provider's
 *  display name; falls back to the raw id for an unknown provider. */
function failCodexLogin(frontendProviderId: string, err: unknown): void {
  const name =
    PROVIDERS.find((p) => p.id === frontendProviderId)?.name ??
    frontendProviderId;
  useUIStore.getState().addToast({
    title: i18n.t("providers:toast.signInFailed", { provider: name }),
    description: err instanceof Error ? err.message : String(err),
    variant: "error",
  });
}

/** Relay the callback's query string to the engine. `submitLoginCode`'s
 *  engine-call wrapper already surfaces a failure toast + Sentry report, so the
 *  catch here only keeps the promise from floating unhandled. */
async function relayCodexCode(
  frontendProviderId: string,
  payload: string,
): Promise<void> {
  try {
    await tauriProvider.submitLoginCode(frontendProviderId, payload);
  } catch (err) {
    console.error("[codex-loopback] submitLoginCode failed:", err);
  }
}

/**
 * Drive the desktop Codex/OpenAI browser sign-in: listen for the loopback
 * callback, bind the native listener, open the authorize URL, and relay the
 * code back to the engine. Surfaces a toast and cleans up the listener on any
 * setup failure; never leaves an orphaned listener on any path (success, error,
 * or timeout). Resolves once the browser has been opened (the callback is
 * handled asynchronously); never rejects.
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
  };

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
    failCodexLogin(frontendProviderId, err);
    return;
  }

  timer = setTimeout(cleanup, CALLBACK_TIMEOUT_MS);

  try {
    await osStartCodexOauthLoopback();
    await osOpenUrl(authorizeUrl);
  } catch (err) {
    cleanup();
    failCodexLogin(frontendProviderId, err);
  }
}
