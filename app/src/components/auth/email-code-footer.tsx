import { useTranslation } from "react-i18next";

/**
 * Helper copy + secondary actions under the 6-digit code entry: where the code
 * went, resend, and a way back (switch address, or leave the account link).
 * `pr-12` mirrors the send button + gap on the row above, so the centered copy
 * lines up with the pin boxes, not the full row.
 */
export function EmailCodeFooter({
  email,
  pending,
  backPending = pending,
  error,
  onResend,
  backLabel,
  onBack,
}: {
  email: string;
  pending: boolean;
  /** Whether Back waits too; a code still being sent can be left. */
  backPending?: boolean;
  error: string | null;
  onResend: () => void;
  backLabel: string;
  onBack: () => void;
}) {
  const { t } = useTranslation("auth");
  return (
    <>
      <p className="pr-12 text-center text-xs text-ink-muted">
        {t("email.codeSentTo", { email })}
      </p>
      <div className="flex items-center justify-center gap-4 pr-12">
        <button
          type="button"
          disabled={pending}
          onClick={onResend}
          className="text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
        >
          {t("email.resendCode")}
        </button>
        <button
          type="button"
          disabled={backPending}
          onClick={onBack}
          className="text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
        >
          {backLabel}
        </button>
      </div>
      {error && (
        <p className="pr-12 text-center text-xs text-danger">{error}</p>
      )}
    </>
  );
}
