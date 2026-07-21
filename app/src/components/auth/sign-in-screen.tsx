import { Button } from "@houston-ai/core";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  cancelPendingAuthorize,
  onAuthError,
  signInWithApple,
  signInWithGoogle,
  signInWithMicrosoft,
} from "../../lib/auth";
import {
  describeLastSignIn,
  lastSignInHint,
  readLastSignIn,
} from "../../lib/last-sign-in";
import { logger } from "../../lib/logger";
import { tauriSystem } from "../../lib/tauri";
import { FirstRunScreen } from "../onboarding/first-run-screen";
import { HoustonLogo } from "../shell/experience-card";
import { authErrorKey } from "./auth-errors";
import { EmailSignIn } from "./email-sign-in";
import { type Provider, ProviderButtonRow } from "./provider-button-row";

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
 * Two-panel card: the LEFT panel is the sign-in itself — Google / Apple /
 * Microsoft as one row of icon pills, then passwordless email under the
 * divider (the 6-digit code stays fully in-app); the RIGHT panel is a calm
 * value note on the filled action surface. A plain white card on the calm grey
 * {@link FirstRunScreen} background (pinned light, so it reads the same in both
 * app themes). Wordmark sits top-left of the screen and the legal links anchor
 * the footer.
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
  const { t: tAuth } = useTranslation("auth");
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Device-local memory of the previous sign-in, read once on mount. Survives
  // sign-out (its own localStorage key), so returning users are guided back to
  // the method they used last.
  const lastSignIn = useMemo(() => {
    const hint = readLastSignIn();
    return hint ? describeLastSignIn(hint) : null;
  }, []);

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
    <FirstRunScreen>
      <div className="flex items-center gap-2 px-8 pt-14 pb-6 text-ink">
        <HoustonLogo size={24} />
        <span className="text-lg font-semibold tracking-tight">Houston</span>
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        {/* A plain white card, hairline + soft shadow, floating on the grey
            first-run background. The FirstRunScreen wrapper pins light, so the
            login reads the same bright way in both app themes. */}
        <div className="grid w-full max-w-3xl grid-cols-1 overflow-hidden rounded-2xl border border-line bg-card text-ink shadow-[0_4px_24px_rgba(0,0,0,0.06)] sm:grid-cols-3">
          <div className="flex flex-col gap-5 bg-card p-8 sm:col-span-2">
            <h1 className="text-lg font-medium">Log in</h1>

            {lastSignIn && (
              <p className="-mt-2 text-xs text-ink-muted">
                {lastSignInHint(lastSignIn, tAuth)}
              </p>
            )}

            <ProviderButtonRow
              pending={pending}
              onSignIn={handleSignIn}
              lastUsed={
                lastSignIn && lastSignIn.highlight !== "email"
                  ? lastSignIn.highlight
                  : null
              }
              lastUsedLabel={tAuth("lastSignIn.lastUsed")}
            />

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-line" />
              <span className="text-xs text-ink-muted">or</span>
              <div className="h-px flex-1 bg-line" />
            </div>

            <EmailSignIn highlight={lastSignIn?.highlight === "email"} />

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

      <div className="flex items-center justify-center gap-3 py-6 text-xs text-ink-muted">
        <button
          type="button"
          onClick={openExternal("https://gethouston.ai/privacy")}
          className="underline-offset-4 hover:text-ink hover:underline"
        >
          Privacy Policy
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={openExternal("https://gethouston.ai/terms")}
          className="underline-offset-4 hover:text-ink hover:underline"
        >
          Terms of Service
        </button>
      </div>
    </FirstRunScreen>
  );
}
