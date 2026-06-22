import type { Session } from "@supabase/supabase-js";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { analytics } from "./analytics";
import { logger } from "./logger";
import { queryClient } from "./query-client";
import { isAuthConfigured, supabase } from "./supabase";
import { tauriSystem } from "./tauri";

// Must match `SESSION_KEY` in `hooks/use-session.ts`. Hardcoded here
// to avoid a hook-importing-from-hook dependency cycle. If you change
// one, change the other.
const SESSION_QUERY_KEY = ["session"] as const;

function applySessionToCache(session: Session | null): void {
  queryClient.setQueryData<Session | null>(SESSION_QUERY_KEY, session);
}

// HTTPS bridge instead of a raw deep link so the user lands on a polished
// "Sign-in complete, you can close this tab" page after Google. The bridge
// at gethouston.ai/auth/callback then forwards the PKCE code into the
// `houston://auth-callback?code=...` deep link so macOS / Windows hand
// it to the running app. See website/src/auth/callback/index.html.
const REDIRECT_URI = "https://gethouston.ai/auth/callback/";

// Track which provider initiated the current OAuth flow so the deep-link
// callback can tag the user_signed_in event with the correct provider.
// Set before the browser opens; read and cleared on successful session.
let pendingProvider: "google" | "azure" | null = null;

/**
 * Kick off an OAuth flow for the given provider. Supabase generates a
 * fresh PKCE verifier (stored in Keychain via our storage adapter),
 * returns an auth URL, and we open it in the user's system browser.
 * After consent the browser redirects to `houston://auth-callback?code=...`,
 * which the deep-link handler in Rust forwards to `installDeepLinkListener`.
 *
 * Idempotent — re-calling kicks off a brand-new PKCE flow, which is
 * exactly what the user wants when they hit the wrong browser profile,
 * abort consent, or generally need to retry.
 */
async function signInWithProvider(provider: "google" | "azure"): Promise<void> {
  if (!isAuthConfigured()) {
    throw new Error("Auth not configured");
  }

  pendingProvider = provider;

  // Web build (no Tauri webview / deep link): a normal in-browser redirect to
  // `/auth/callback`, where Supabase's URL sniffer (detectSessionInUrl) trades
  // the `?code=` for a session. The desktop flow below opens the system browser
  // and waits for the `houston://` deep link instead.
  if (!isTauri()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
    return; // Supabase navigates the page to the consent screen.
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: REDIRECT_URI,
      // Don't let Supabase touch window.location — we're in a webview and
      // need the consent page to open in the user's real browser.
      skipBrowserRedirect: true,
      // Microsoft (Entra) needs the standard OIDC trio plus
      // `offline_access` to issue a refresh token; without it Supabase
      // gets the ID token but no way to refresh, and the session goes
      // stale on the first reload. Matches Supabase's documented azure
      // default. We deliberately don't request `profile` / `User.Read`
      // since Houston only needs the email + sub claims for sign-in.
      ...(provider === "azure"
        ? {
            scopes: "openid email offline_access",
            // Force the account picker so users with multiple Microsoft
            // accounts (work + personal) can choose; otherwise Microsoft
            // silently picks the last-used one which is the #1 source of
            // "wrong account" sign-in confusion.
            queryParams: { prompt: "select_account" },
          }
        : {}),
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error("Supabase returned no auth URL");

  await tauriSystem.openUrl(data.url);
}

/**
 * Subscribers notified whenever the deep-link / PKCE exchange path
 * surfaces an OAuth error (provider-side error, code exchange failure,
 * malformed callback URL). Wired up so [`SignInScreen`] can display the
 * real provider message instead of a generic "Something went wrong".
 */
type AuthErrorListener = (message: string) => void;
const authErrorListeners = new Set<AuthErrorListener>();

export function onAuthError(cb: AuthErrorListener): () => void {
  authErrorListeners.add(cb);
  return () => authErrorListeners.delete(cb);
}

function emitAuthError(message: string): void {
  for (const cb of authErrorListeners) {
    try {
      cb(message);
    } catch (e) {
      logger.warn(`[auth] error listener threw: ${e}`);
    }
  }
}

export const signInWithGoogle = (): Promise<void> =>
  signInWithProvider("google");
export const signInWithMicrosoft = (): Promise<void> =>
  signInWithProvider("azure");

/**
 * Sign out: clear the Supabase session (our Keychain storage adapter
 * removes the tokens), fire the sign-out event, and reset PostHog's
 * distinct_id so subsequent anonymous events don't accrue to the prior user.
 */
export async function signOut(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    logger.warn(`[auth] signOut failed: ${e}`);
  }
  analytics.track("user_signed_out");
  analytics.reset();
}

let deepLinkInstalled = false;

/**
 * Listen for `auth://deep-link` events emitted by the Rust deep-link
 * handler (see `app/src-tauri/src/auth.rs`). Extracts the `code` param
 * from the callback URL and completes the PKCE exchange to populate the
 * Supabase session in Keychain.
 *
 * Idempotent — safe to call more than once per app lifetime.
 */
export function installDeepLinkListener(): () => void {
  if (deepLinkInstalled) return () => {};
  deepLinkInstalled = true;

  const unlistenPromise = listen<string>("auth://deep-link", async (event) => {
    const rawUrl = event.payload;
    logger.info(`[auth] deep-link received: ${rawUrl}`);

    try {
      const url = new URL(rawUrl);
      // OAuth errors can land in the query string (PKCE code flow) OR the
      // fragment (implicit flow / some Microsoft Entra paths). Check both.
      const fragmentParams = new URLSearchParams(
        url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
      );
      const code = url.searchParams.get("code");
      const errorParam =
        url.searchParams.get("error_description") ||
        url.searchParams.get("error") ||
        fragmentParams.get("error_description") ||
        fragmentParams.get("error");

      if (errorParam) {
        logger.error(`[auth] OAuth error: ${errorParam}`);
        emitAuthError(errorParam);
        return;
      }

      // Two callback shapes can land here:
      //   PKCE   →  ?code=...                  (the `flowType: "pkce"`
      //                                         path; client owns the
      //                                         verifier in storage).
      //   Implicit → #access_token=...&refresh_token=...
      //
      // Our client config asks for PKCE, but on Windows the desktop build
      // has been observed to receive implicit-flow URLs (Supabase project
      // config + an async Keychain adapter that silently swallows storage
      // failures combine to make the JS lib generate an OAuth URL without
      // `code_challenge`). The user got all the way through Google consent;
      // the only thing left is installing the session — there is no reason
      // to leave them stranded just because the URL shape doesn't match
      // what we expected. Handle both, prefer PKCE when both are present
      // (which never happens in practice — Supabase emits one or the other).
      if (code) {
        const { data, error } =
          await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          logger.error(
            `[auth] exchangeCodeForSession failed: ${error.message}`,
          );
          emitAuthError(error.message);
          return;
        }
        applySessionToCache(data.session ?? null);
        analytics.track("user_signed_in", {
          provider: pendingProvider ?? "unknown",
        });
        pendingProvider = null;
        logger.info(
          `[auth] session established (pkce) for ${data.user?.email}`,
        );
        return;
      }

      const accessToken = fragmentParams.get("access_token");
      const refreshToken = fragmentParams.get("refresh_token");
      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          logger.error(`[auth] setSession failed: ${error.message}`);
          emitAuthError(error.message);
          return;
        }
        // Push the session directly into the TanStack Query cache that
        // `useSession` reads. Belt-and-suspenders over Supabase's
        // `onAuthStateChange` listener, which a real Windows v0.4.14
        // install was observed to skip for `setSession` calls 12 times
        // in a row — every implicit-flow sign-in succeeded server-side
        // but the auth gate in App.tsx never re-rendered. Writing the
        // cache key directly here makes the UI transition deterministic
        // regardless of whether the listener fires.
        applySessionToCache(data.session ?? null);
        analytics.track("user_signed_in", {
          provider: pendingProvider ?? "unknown",
        });
        pendingProvider = null;
        logger.info(
          `[auth] session established (implicit) for ${data.user?.email}`,
        );
        return;
      }

      logger.warn(
        "[auth] deep-link had neither `code` nor `access_token` — ignoring",
      );
      emitAuthError("Sign-in callback was missing the authorization code.");
    } catch (e) {
      logger.error(`[auth] failed to handle deep-link: ${e}`);
      emitAuthError(String(e));
    }
  });

  return () => {
    unlistenPromise.then((fn) => fn()).catch(() => {});
    deepLinkInstalled = false;
  };
}
