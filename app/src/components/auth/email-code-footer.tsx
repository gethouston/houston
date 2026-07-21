/**
 * Helper copy + secondary actions under the 6-digit code entry: where the code
 * went, resend, and switch-address. `pr-12` mirrors the send button + gap on
 * the row above, so the centered copy lines up with the pin boxes, not the
 * full row.
 */
export function EmailCodeFooter({
  email,
  pending,
  error,
  onResend,
  onChangeEmail,
}: {
  email: string;
  pending: boolean;
  error: string | null;
  onResend: () => void;
  onChangeEmail: () => void;
}) {
  return (
    <>
      <p className="pr-12 text-center text-xs text-ink-muted">
        We sent a 6-digit code to {email}.
      </p>
      <div className="flex items-center justify-center gap-4 pr-12">
        <button
          type="button"
          disabled={pending}
          onClick={onResend}
          className="text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
        >
          Resend code
        </button>
        <button
          type="button"
          onClick={onChangeEmail}
          className="text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Use a different email
        </button>
      </div>
      {error && (
        <p className="pr-12 text-center text-xs text-danger">{error}</p>
      )}
    </>
  );
}
