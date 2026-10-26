import type { AccountLinkView } from "@houston/sdk/identity";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { PROVIDER_NAME } from "../../lib/account-link";
import { confirmAccountLink, identityClient } from "../../lib/auth";
import { logAndReportError } from "../../lib/error-report";
import { authErrorKey } from "./auth-errors";
import { EmailCodeEntry } from "./email-code-entry";
import { EmailCodeFooter } from "./email-code-footer";

/** The steps the panel replaces the sign-in options for. A `linked` flow has
 *  already handed the app its session, so the screen is on its way out. */
type ActiveLink = Extract<
  AccountLinkView,
  { status: "sending_code" | "needs_code" | "verifying" | "linking" }
>;

export function isLinkActive(view: AccountLinkView): view is ActiveLink {
  return (
    view.status !== "idle" &&
    view.status !== "refused" &&
    view.status !== "linked"
  );
}

/**
 * The account-exists step: a Google, Microsoft or Apple sign-in met an
 * existing account, so the person enters the code mailed to that address and
 * the provider is added to it. The SDK owns every step; this renders them.
 */
export function AccountLinkPanel({ view }: { view: ActiveLink }) {
  const { t } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  const [code, setCode] = useState("");
  const pending = view.status !== "needs_code";
  const provider = PROVIDER_NAME[view.provider];
  const codeError = view.status === "needs_code" ? view.codeError : null;

  const verify = async (value: string) => {
    if (value.trim().length < 6) return;
    try {
      const outcome = await confirmAccountLink(value);
      if (outcome.kind === "code_rejected") setCode("");
    } catch (error) {
      logAndReportError("account_link_verify", error);
    }
  };

  const resend = async () => {
    try {
      await identityClient.resendAccountLinkCode();
    } catch (error) {
      logAndReportError("account_link_resend", error);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void verify(code);
  };

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-medium">{t("link.title")}</h2>
        <p className="text-sm text-ink-muted">
          {t("link.body", { email: view.email, provider })}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <EmailCodeEntry
          code={code}
          onChange={setCode}
          onComplete={(value) => void verify(value)}
          pending={pending}
          filled
          label={t("email.verifyCode")}
        />
        <EmailCodeFooter
          email={view.email}
          pending={pending}
          error={codeError ? tErrors(authErrorKey(codeError)) : null}
          onResend={() => void resend()}
          backLabel={t("link.back")}
          onBack={() => identityClient.cancelAccountLink()}
        />
      </div>
    </form>
  );
}

const REFUSAL_KEY = {
  link_email_unknown: "link.refused.emailUnknown",
  link_email_mismatch: "link.refused.failed",
  link_failed: "link.refused.failed",
  link_expired: "link.refused.expired",
} as const;

/** Why the last link stopped, for the sign-in screen's error line. A taken
 *  identity signed the person in by email, so its notice is a toast. */
export function useAccountLinkNotice(view: AccountLinkView): string | null {
  const { t } = useTranslation("auth");
  if (view.status !== "refused" || view.refusal === "link_identity_taken")
    return null;
  return t(REFUSAL_KEY[view.refusal], {
    provider: PROVIDER_NAME[view.provider],
  });
}
