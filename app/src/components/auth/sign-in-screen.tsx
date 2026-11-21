import { HoustonHelmet } from "@houston-ai/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccountLink } from "../../hooks/use-account-link";
import { describeLastSignIn, readLastSignIn } from "../../lib/last-sign-in";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { FirstRunScreen } from "../onboarding/first-run-screen";
import {
  AccountLinkPanel,
  isLinkActive,
  useAccountLinkNotice,
} from "./account-link-panel";
import { ContinueLastSignIn } from "./continue-last-sign-in";
import { EmailSignIn } from "./email-sign-in";
import {
  hasAvailableProviders,
  ProviderButtonRow,
  providerAvailable,
} from "./provider-button-row";
import { ReferralPanel } from "./referral-panel";
import { Divider, LegalFooter } from "./sign-in-panels";
import { useProviderSignIn } from "./use-provider-sign-in";

export function SignInScreen() {
  const showReferral = canPurchaseInApp();
  const { t: tAuth } = useTranslation("auth");
  const { pending, error, handleSignIn } = useProviderSignIn();
  const link = useAccountLink();
  const linkNotice = useAccountLinkNotice(link);
  const [emailAutoSubmit, setEmailAutoSubmit] = useState<{
    email: string;
    token: number;
  } | null>(null);

  const lastSignIn = useMemo(() => {
    const hint = readLastSignIn();
    return hint ? { ...describeLastSignIn(hint), fullEmail: hint.email } : null;
  }, []);

  const onContinue = () => {
    if (!lastSignIn) return;
    if (lastSignIn.highlight === "email") {
      setEmailAutoSubmit({ email: lastSignIn.fullEmail, token: Date.now() });
      return;
    }
    void handleSignIn(lastSignIn.highlight)();
  };

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
        <div
          className={`grid w-full max-w-3xl grid-cols-1 overflow-hidden rounded-2xl border border-line bg-card text-ink shadow-raised${showReferral ? " md:grid-cols-3" : ""}`}
        >
          <div
            className={`flex flex-col gap-5 bg-card p-6 md:p-8${showReferral ? " md:col-span-2" : ""}`}
          >
            {isLinkActive(link) ? (
              <AccountLinkPanel view={link} />
            ) : (
              <>
                <h1 className="text-lg font-medium">{tAuth("title")}</h1>

                {showContinue && lastSignIn && continueTitle && (
                  <>
                    <ContinueLastSignIn
                      highlight={lastSignIn.highlight}
                      title={continueTitle}
                      email={lastSignIn.email}
                      pending={
                        pending !== null && pending === lastSignIn.highlight
                      }
                      disabled={pending !== null}
                      onClick={onContinue}
                    />
                    <Divider label={tAuth("divider.orAnotherWay")} />
                  </>
                )}

                {!emailFlowActive && (
                  <>
                    <ProviderButtonRow
                      pending={pending}
                      onSignIn={handleSignIn}
                    />
                    {hasAvailableProviders() && (
                      <Divider label={tAuth("divider.or")} />
                    )}
                  </>
                )}

                <EmailSignIn
                  submitFilled={!showContinue}
                  autoSubmit={emailAutoSubmit ?? undefined}
                />
              </>
            )}

            {(error ?? linkNotice) && (
              <p className="text-xs text-danger">{error ?? linkNotice}</p>
            )}
          </div>

          {showReferral && <ReferralPanel />}
        </div>
      </div>

      <LegalFooter />
    </FirstRunScreen>
  );
}
