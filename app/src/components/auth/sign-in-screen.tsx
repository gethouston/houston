import { Button } from "@houston-ai/core";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  cancelPendingAuthorize,
  onAuthError,
  signInWithApple,
  signInWithGoogle,
  signInWithMicrosoft,
} from "../../lib/auth";
import { isAppleSignInEnabled } from "../../lib/identity";
import { logger } from "../../lib/logger";
import { tauriSystem } from "../../lib/tauri";
import { HoustonLogo } from "../shell/experience-card";
import { SpaceScreen } from "../space/space-screen";
import { authErrorKey } from "./auth-errors";
import { EmailSignIn } from "./email-sign-in";
import { AppleIcon, GoogleIcon, MicrosoftIcon } from "./provider-brand-icons";

type Provider = "google" | "apple" | "azure";

const SIGN_IN_BY_PROVIDER = {
  google: signInWithGoogle,
  apple: signInWithApple,
  azure: signInWithMicrosoft,
} as const;

const openExternal = (url: string) => () => {
  void tauriSystem.openUrl(url);
};

/**
 * Full-screen sign-in overlay. Rendered by App.tsx when identity (Firebase) is
 * configured but no session is present (the local account login), and by the
 * cloud engine gate (HostedEngineGate) for the remote-connection login. Keeps
 * copy product-benefit-focused — the audience is non-technical, so no mention
 * of OAuth / tokens / APIs.
 *
 * Two-panel card: the LEFT panel is the sign-in itself (Google, Apple,
 * Microsoft, and passwordless email — the 6-digit code stays fully in-app);
 * the RIGHT panel is
 * a calm value note on a muted surface. The card is pinned to the DARK palette
 * (data-theme="dark") so the login looks the same in both app themes: dark
 * "Log in" surface, dark value panel, light primary buttons. Wordmark sits
 * top-left of the screen and the legal links anchor the footer.
 *
 * Re-click semantics: the provider spinner is on only until the system browser
 * opens (`onBrowserOpened` clears it). After that the buttons are free — a
 * re-click starts a fresh PKCE attempt that SUPERSEDES the previous one (the
 * abandoned attempt resolves benignly, no error). Unmounting the screen (e.g.
 * the user finishes email sign-in while a Google tab is still open) cancels any
 * in-flight loopback authorize so a late callback can't overwrite the session.
 */
export function SignInScreen() {
  const { t } = useTranslation("errors");
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cancel any in-flight loopback authorize when this screen unmounts, so a late
  // browser completion can't overwrite a session the user established another way.
  useEffect(() => cancelPendingAuthorize, []);

  // Surface OAuth errors that happen AFTER the browser hands off (provider
  // rejection, code-exchange failure, identity already linked to another
  // user). Without this the user only saw the "kick off" failure path and
  // every post-callback failure was invisible. Post-hand-off failures arrive
  // as stable identity codes, resolved to localized copy here.
  useEffect(() => {
    return onAuthError((code) => {
      setPending(null);
      setError(t(authErrorKey(code)));
    });
  }, [t]);

  const handleSignIn = (provider: Provider) => async () => {
    setPending(provider);
    setError(null);
    // `onBrowserOpened` re-enables the buttons the instant the system browser
    // opens, so the whole (up-to-300s) round-trip never freezes them.
    const opts = { onBrowserOpened: () => setPending(null) };
    try {
      await SIGN_IN_BY_PROVIDER[provider](opts);
    } catch (e) {
      logger.error(`[auth] ${provider} sign-in failed: ${e}`);
      setError(t(authErrorKey(e)));
    } finally {
      // Belt-and-suspenders for a PRE-browser failure (config / loopback bind),
      // where `onBrowserOpened` never fired. Post-browser, this is a no-op.
      setPending(null);
    }
  };

  return (
    <SpaceScreen>
      <div className="flex items-center gap-2 px-8 pt-14 pb-6 text-[var(--ht-space-foreground)]">
        <HoustonLogo size={24} />
        <span className="text-lg font-semibold tracking-tight">Houston</span>
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        {/* data-theme="dark" pins the whole card to the dark palette so the
            login reads identically in both app themes (dark card on the
            theme-invariant space backdrop). */}
        {/* text-ink is declared HERE, inside the pin, on purpose:
            `color` inherits as a computed value, so a token utility set on an
            ancestor outside the pin would carry the APP theme's foreground in. */}
        <div
          data-theme="dark"
          className="grid w-full max-w-3xl grid-cols-1 overflow-hidden rounded-2xl border border-[var(--ht-space-glass-border)] text-ink shadow-2xl sm:grid-cols-3"
        >
          {/* The landing page's glass surface (`--ht-space-glass`), so the
              login card and the marketing site read as one material. */}
          <div className="flex flex-col gap-5 bg-[var(--ht-space-glass)] p-8 backdrop-blur-md sm:col-span-2">
            <h1 className="text-lg font-medium">Log in</h1>

            <div className="flex flex-col gap-2.5">
              <Button
                variant="default"
                onClick={handleSignIn("google")}
                disabled={pending !== null}
                className="h-10 w-full justify-center rounded-full border-none! shadow-none"
              >
                {pending === "google" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Continue with Google
              </Button>
              {/* Gated: renders only once the GCIP apple.com provider is
                  configured (APPLE_SIGN_IN_ENABLED) — an unconfigured build
                  must never show a sign-in method that can only error. */}
              {isAppleSignInEnabled() && (
                <Button
                  variant="default"
                  onClick={handleSignIn("apple")}
                  disabled={pending !== null}
                  className="h-10 w-full justify-center rounded-full border-none! shadow-none"
                >
                  {pending === "apple" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <AppleIcon />
                  )}
                  Continue with Apple
                </Button>
              )}
              <Button
                variant="default"
                onClick={handleSignIn("azure")}
                disabled={pending !== null}
                className="h-10 w-full justify-center rounded-full border-none! shadow-none"
              >
                {pending === "azure" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MicrosoftIcon />
                )}
                Continue with Microsoft
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-line" />
              <span className="text-xs text-ink-muted">or</span>
              <div className="h-px flex-1 bg-line" />
            </div>

            <EmailSignIn />

            {error && <p className="text-xs text-danger">{error}</p>}
          </div>

          <div className="flex flex-col justify-between gap-6 bg-action p-8 text-action-text sm:col-span-1">
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-medium">Share the love</h2>
              <p className="text-sm text-action-text/70">
                Know a team that would fly with Houston? Send them our way. When
                they commit to 5 or more licenses, your team gets $250 in
                credits.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={openExternal("https://gethouston.ai/referrals")}
              className="-ml-3 gap-1 self-start text-action-text hover:bg-action-text/10 hover:text-action-text dark:hover:bg-action-text/10"
            >
              See how it works
              <ArrowUpRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 py-6 text-xs text-[var(--ht-space-foreground-muted)]">
        <button
          type="button"
          onClick={openExternal("https://gethouston.ai/privacy")}
          className="underline-offset-4 hover:text-[var(--ht-space-foreground)] hover:underline"
        >
          Privacy Policy
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={openExternal("https://gethouston.ai/terms")}
          className="underline-offset-4 hover:text-[var(--ht-space-foreground)] hover:underline"
        >
          Terms of Service
        </button>
      </div>
    </SpaceScreen>
  );
}
