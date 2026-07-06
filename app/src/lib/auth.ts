import type { Session } from "@supabase/supabase-js";
import { listen } from "@tauri-apps/api/event";
import { analytics } from "./analytics";
import { logger } from "./logger";
import { osIsTauri, osStartOauthLoopback } from "./os-bridge";
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

// Where Supabase sends the browser after Google consent. Resolved per
// client at sign-in time by `resolveRedirectUri`:
//
//   • Desktop (Tauri): a one-shot `http://127.0.0.1:<port>/auth/callback`
//     loopback the app itself serves. A plain HTTP navigation — no website
//     relay and no custom-scheme "open Houston?" dialog — so the user snaps
//     straight back into the app instead of getting stranded on a web page.
//   • Web / mobile PWA: the https relay bridge at gethouston.ai/auth/callback,
//     which forwards the PKCE code into the `houston://` deep link. These
//     clients aren't co-located with a local listener, so the bridge stays.
//     See website/src/auth/callback/index.html.
//
// `houston://auth-callback` is the desktop fallback if the loopback can't
// bind (every candidate port busy). All three shapes are registered in the
// Supabase project's redirect allow-list.
const WEB_REDIRECT_URI = "https://gethouston.ai/auth/callback/";
const DESKTOP_FALLBACK_REDIRECT_URI = "houston://auth-callback";

/**
 * Pick — and, on desktop, provision — the OAuth redirect target. Desktop
 * starts a loopback listener and returns its URL; if that can't bind we fall
 * back to the custom-scheme deep link rather than stranding the user.
 */
async function resolveRedirectUri(): Promise<string> {
  if (!osIsTauri()) return WEB_REDIRECT_URI;
  try {
    return await osStartOauthLoopback();
  } catch (e) {
    logger.warn(
      `[auth] loopback listener unavailable, falling back to deep link: ${e}`,
    );
    return DESKTOP_FALLBACK_REDIRECT_URI;
  }
}

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
  // and waits for the `houston://` deep link (or the loopback redirect) instead.
  if (!osIsTauri()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
    return; // Supabase navigates the page to the consent screen.
  }

  // Desktop: provision the loopback listener (or fall back to the deep link)
  // and hand Supabase the resolved redirect target.
  const redirectTo = await resolveRedirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
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
 * Passwordless email sign-in, step 1: mail the user a 6-digit code.
 *
 * We use the OTP *code* (not a magic link) on purpose: a code keeps the
 * whole flow inside the app — no browser, no redirect, no deep link — and
 * works even when the user reads the email on a different device. Magic
 * links would need a redirect back to the desktop app, the exact friction
 * we removed from the OAuth flow.
 *
 * Requires the Supabase email template to render `{{ .Token }}`; otherwise
 * the user receives a magic link with no visible code.
 */
export async function sendEmailOtp(email: string): Promise<void> {
  if (!isAuthConfigured()) {
    throw new Error("Auth not configured");
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/**
 * Passwordless email sign-in, step 2: verify the 6-digit code. On success
 * Supabase persists the session via our storage adapter; we mirror it into
 * the TanStack Query cache so the auth gate flips immediately (same
 * belt-and-suspenders write the deep-link path uses).
 */
export async function verifyEmailOtp(
  email: string,
  token: string,
): Promise<void> {
  if (!isAuthConfigured()) {
    throw new Error("Auth not configured");
  }
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error) throw error;
  // verifyOtp can resolve with `error == null` but `session == null` (e.g. a
  // misconfigured email template, or a code accepted as a confirmation rather
  // than a sign-in). Caching null here would silently leave the auth gate up
  // — the user typed a valid code, it "succeeded", and nothing happens. Throw
  // so EmailSignIn's catch surfaces it (no-silent-failures rule).
  if (!data.session) {
    throw new Error("Sign-in succeeded but returned no session.");
  }
  applySessionToCache(data.session);
  analytics.track("user_signed_in", { provider: "email" });
  logger.info(`[auth] session established (email otp) for ${data.user?.email}`);
}

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

  const unlistenPromise = listen<string>("auth://deep-link", (event) => {
    logger.info(`[auth] deep-link received: ${event.payload}`);
    void completeAuthCallback(event.payload);
  });

  return () => {
    unlistenPromise.then((fn) => fn()).catch(() => {});
    deepLinkInstalled = false;
  };
}

/**
 * Complete an OAuth callback: pull the `code` (PKCE) or `access_token`
 * (implicit) out of a callback URL and install the Supabase session. Driven by
 * the desktop deep-link listener. Errors surface through `emitAuthError`, not by
 * throwing, so the sign-in UI reacts without an exception.
 */
async function completeAuthCallback(rawUrl: string): Promise<void> {
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
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        logger.error(`[auth] exchangeCodeForSession failed: ${error.message}`);
        emitAuthError(error.message);
        return;
      }
      applySessionToCache(data.session ?? null);
      analytics.track("user_signed_in", {
        provider: pendingProvider ?? "unknown",
      });
      pendingProvider = null;
      logger.info(`[auth] session established (pkce) for ${data.user?.email}`);
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
      if (!data.session) {
        logger.error("[auth] setSession returned no session");
        emitAuthError("Sign-in succeeded but returned no session.");
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
      applySessionToCache(data.session);
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
      "[auth] callback had neither `code` nor `access_token` — ignoring",
    );
    emitAuthError("Sign-in callback was missing the authorization code.");
  } catch (e) {
    logger.error(`[auth] failed to handle callback: ${e}`);
    emitAuthError(String(e));
  }
}
