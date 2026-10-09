import { HoustonHelmet } from "@houston-ai/core";
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
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { FirstRunScreen } from "../onboarding/first-run-screen";
import { authErrorKey } from "./auth-errors";
import { ContinueLastSignIn } from "./continue-last-sign-in";
import { EmailSignIn } from "./email-sign-in";
import {
  hasAvailableProviders,
  type Provider,
  ProviderButtonRow,
  providerAvailable,
} from "./provider-button-row";
import { ReferralPanel } from "./referral-panel";
import { LegalFooter } from "./sign-in-panels";

const SIGN_IN_BY_PROVIDER = {
  google: signInWithGoogle,
  apple: signInWithApple,
  azure: signInWithMicrosoft,
} as const;

/**
 * Shared sign-in screen for local and hosted sessions. A remembered provider
 * gets the filled continue button; native builds offer only configured native
 * providers and omit the referral promotion. Email code sign-in stays available.
 * The desktop loopback flow is cancelled on unmount so a late callback cannot
 * replace a session established through another method.
 */
export function SignInScreen() {
  const showReferral = canPurchaseInApp();
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
  // back to the account they used last. Keeps the raw address for the email
  // auto-prefill; the button captions the (validated) full address.
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
  const showContinue =
    lastSignIn !== null &&
    !emailFlowActive &&
    (lastSignIn.highlight === "email" ||
      providerAvailable(lastSignIn.highlight));
  const continueTitle =
    lastSignIn &&
    (lastSignIn.providerName
      ? tAuth("lastSignIn.continueWithProvider", {
          provider: lastSignIn.providerName,
        })
      : tAuth("lastSignIn.continueWithEmail"));

  return (
    <FirstRunScreen>
      <div className="flex items-center gap-2 px-6 pt-14 pb-6 text-ink md:px-8">
        <HoustonHelmet color="currentColor" size={24} />
        <span className="text-lg font-semibold tracking-tight">Houston</span>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 md:px-6">
        {/* A plain white card, hairline + soft shadow, floating on the grey
            first-run background. The FirstRunScreen wrapper pins light, so the
            login reads the same bright way in both app themes. */}
        <div
          className={`grid w-full max-w-3xl grid-cols-1 overflow-hidden rounded-2xl border border-line bg-card text-ink shadow-raised${showReferral ? " md:grid-cols-3" : ""}`}
        >
          <div
            className={`flex flex-col gap-5 bg-card p-6 md:p-8${showReferral ? " md:col-span-2" : ""}`}
          >
            <h1 className="text-lg font-medium">{tAuth("title")}</h1>

            {showContinue && lastSignIn && continueTitle && (
              <>
                <ContinueLastSignIn
                  highlight={lastSignIn.highlight}
                  title={continueTitle}
                  email={lastSignIn.email}
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
                {hasAvailableProviders() && (
                  <Divider label={tAuth("divider.or")} />
                )}
              </>
            )}

            <EmailSignIn
              submitFilled={!showContinue}
              autoSubmit={emailAutoSubmit ?? undefined}
            />

            {error && <p className="text-xs text-danger">{error}</p>}
          </div>

          {showReferral && <ReferralPanel />}
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
