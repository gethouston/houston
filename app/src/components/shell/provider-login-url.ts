/**
 * Pure helpers for the provider OAuth login dialog.
 *
 * The fallback OAuth URL the CLI prints is long, query-laden, and
 * meaningless to a non-technical user — dumping it raw made the dialog
 * tall and ugly (issue #297). We hide the URL behind a reveal toggle and
 * instead show a friendly destination hint built from its hostname. Both
 * the hostname parse and the toggle live here as pure functions so the
 * dialog stays a thin render layer and the host parse is unit-testable.
 */

import { codexUsesLoopbackRelay } from "../../lib/engine-mode.ts";

/**
 * Friendly host for the "you'll be taken to …" hint. Returns the bare
 * hostname (no scheme, no `www.`, no port/path/query) or `null` when the
 * string isn't a parseable absolute URL — the caller then omits the hint
 * rather than showing a broken one.
 */
export function providerLoginUrlHost(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  return parsed.hostname.replace(/^www\./, "");
}

/**
 * Decide whether a `ProviderLoginUrl` event should open the user's browser
 * directly (skipping the dialog) instead of surfacing the paste/code dialog.
 *
 * On desktop the runtime is co-located, so a loopback OAuth flow (no device
 * code) completes when the user approves in their OWN browser — the localhost
 * callback finishes it and `ProviderLoginComplete` flips the card, with no code
 * to enter. A device code (`userCode` present) still needs the dialog so the
 * user can read it, and remote / headless web clients always use the dialog
 * because their runtime can't reach a local browser. Mirrors the runtime's own
 * loopback-vs-headless split (see the runtime's `codexLoginMethod`).
 */
export function shouldOpenLoginUrlDirectly(opts: {
  isDesktop: boolean;
  userCode: string | null | undefined;
}): boolean {
  return opts.isDesktop && !opts.userCode;
}

/**
 * Decide whether a `ProviderLoginUrl` event for Codex/OpenAI should drive the
 * desktop's zero-code loopback relay (`beginCodexBrowserLogin`) instead of the
 * plain open-in-browser path or the device-code dialog.
 *
 * True only for Codex (`provider === "openai"`) on a Tauri desktop whose engine
 * is REMOTE (`codexUsesLoopbackRelay`) and with no device code pending: there
 * pi's own 1455 lives in the pod, so the desktop binds a LOCAL 1455 and relays
 * the callback code — ChatGPT sign-in with zero device code even against a
 * remote engine, and no collision with pi. A CO-LOCATED desktop (local sidecar
 * or a loopback dev URL) returns false and keeps pi's own browser flow (pi owns
 * 1455 there — an app bind would fight it). A device code present, or a web
 * client, also stay on their existing paths.
 */
export function shouldUseCodexLoopback(opts: {
  provider: string;
  env: { VITE_NEW_ENGINE_URL?: string; VITE_HOSTED_ENGINE_URL?: string };
  isTauri: boolean;
  userCode: string | null | undefined;
}): boolean {
  return (
    opts.provider === "openai" &&
    codexUsesLoopbackRelay(opts.env, { isTauri: opts.isTauri }) &&
    !opts.userCode
  );
}
