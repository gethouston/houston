import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  cancelPendingAuthorize,
  onAuthError,
  signInWithApple,
  signInWithGoogle,
  signInWithMicrosoft,
} from "../../lib/auth";
import { describeLastSignIn, readLastSignIn } from "../../lib/last-sign-in";
import { logger } from "../../lib/logger";
import { FirstRunScreen } from "../onboarding/first-run-screen";
import { HoustonLogo } from "../shell/experience-card";
import { authErrorKey } from "./auth-errors";
import { ContinueLastSignIn } from "./continue-last-sign-in";
import { EmailSignIn } from "./email-sign-in";
import { type Provider, ProviderButtonRow } from "./provider-button-row";
import { LegalFooter, ReferralPanel } from "./sign-in-panels";

const SIGN_IN_BY_PROVIDER = {
  google: signInWithGoogle,
  apple: signInWithApple,
  azure: signInWithMicrosoft,
} as const;

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
 * Returning user: when a device-local last-sign-in exists, a prominent filled
 * {@link ContinueLastSignIn} button leads the panel ("Continue with Google" +
 * the masked address), the one-click way back to the same account; the pills and
 * email form drop below an "or use another way" divider. The button owns the
 * screen's single filled slot, so the email send button steps down to secondary
 * while it shows. Choosing the email continue collapses the chrome to a focused
 * code entry.
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
  // The email code flow, once started from the continue button, collapses the
  // returning-user chrome (continue button + "another way" options) down to the
  // focused address/code entry. A rising token drives EmailSignIn's auto-send.
  const [emailAutoSubmit, setEmailAutoSubmit] = useState<{
    email: string;
    token: number;
  } | null>(null);

  // Device-local memory of the previous sign-in, read once on mount. Survives
  // sign-out (its own localStorage key), so returning users get a one-click path
  // back to the account they used last. Keeps the full address for the email
  // auto-prefill; only the masked form is ever shown.
  const lastSignIn = useMemo(() => {
    const hint = readLastSignIn();
    return hint ? { ...describeLastSignIn(hint), fullEmail: hint.email } : null;
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

  // The one-click return path. For an OAuth provider it runs the very same
  // sign-in the matching pill would; for the email path it hands the stored
  // address to EmailSignIn's auto-send and collapses to the code entry.
  const onContinue = () => {
    if (!lastSignIn) return;
    if (lastSignIn.highlight === "email") {
      setEmailAutoSubmit({ email: lastSignIn.fullEmail, token: Date.now() });
      return;
    }
    void handleSignIn(lastSignIn.highlight)();
  };

  // Once the email flow is running, the returning-user chrome collapses so the
  // user sees only the code entry.
  const emailFlowActive = emailAutoSubmit !== null;
  const showContinue = lastSignIn !== null && !emailFlowActive;
  const continueTitle =
    lastSignIn &&
    (lastSignIn.providerName
      ? tAuth("lastSignIn.continueWithProvider", {
          provider: lastSignIn.providerName,
        })
      : tAuth("lastSignIn.continueWithEmail"));

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

            {showContinue && lastSignIn && continueTitle && (
              <>
                <ContinueLastSignIn
                  highlight={lastSignIn.highlight}
                  title={continueTitle}
                  maskedEmail={lastSignIn.maskedEmail}
                  pending={pending !== null && pending === lastSignIn.highlight}
                  disabled={pending !== null}
                  onClick={onContinue}
                />
                <Divider label={tAuth("divider.orAnotherWay")} />
              </>
            )}

            {!emailFlowActive && (
              <>
                <ProviderButtonRow pending={pending} onSignIn={handleSignIn} />
                <Divider label={tAuth("divider.or")} />
              </>
            )}

            <EmailSignIn
              submitFilled={!showContinue}
              autoSubmit={emailAutoSubmit ?? undefined}
            />

            {error && <p className="text-xs text-danger">{error}</p>}
          </div>

          <ReferralPanel />
        </div>
      </div>

      <LegalFooter />
    </FirstRunScreen>
  );
}

/** A hairline rule with a centered lowercase label ("or", "or use another way"). */
function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-line" />
      <span className="text-xs text-ink-muted">{label}</span>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}
