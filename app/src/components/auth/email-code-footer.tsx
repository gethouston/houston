import { useTranslation } from "react-i18next";

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
