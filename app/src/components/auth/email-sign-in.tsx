import { Button, Input } from "@houston-ai/core";
import { ArrowRight, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { sendEmailOtp, verifyEmailOtp } from "../../lib/auth";
import { logger } from "../../lib/logger";
import { authErrorKey } from "./auth-errors";

type Step = "email" | "code";

/**
 * Passwordless email sign-in: enter an address, receive a 6-digit code, type
 * it back. Stays entirely in the app (no browser, no redirect) — the desktop
 * counterpart to the loopback OAuth flow. On success the parent SignInScreen
 * unmounts as soon as the session lands in the query cache.
 *
 * Compact inline shape: a rounded field with a send button on its right, so the
 * email path sits neatly under the OAuth buttons in the sign-in panel.
 */
export function EmailSignIn() {
  const { t } = useTranslation("errors");
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);
    try {
      await sendEmailOtp(trimmed);
      setStep("code");
    } catch (err) {
      logger.error(`[auth] email otp send failed: ${err}`);
      setError(t(authErrorKey(err)));
    } finally {
      setPending(false);
    }
  };

  const verifyCode = async () => {
    const trimmedCode = code.trim();
    if (!trimmedCode) return;
    setPending(true);
    setError(null);
    try {
      await verifyEmailOtp(email.trim(), trimmedCode);
      // Success: the session write flips the auth gate and unmounts us.
    } catch (err) {
      logger.error(`[auth] email otp verify failed: ${err}`);
      setError(t(authErrorKey(err)));
    } finally {
      setPending(false);
    }
  };

  const onSendSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendCode();
  };

  const onVerifySubmit = (e: FormEvent) => {
    e.preventDefault();
    void verifyCode();
  };

  const SendButton = ({ disabled }: { disabled: boolean }) => (
    <Button
      type="submit"
      size="icon"
      disabled={disabled}
      aria-label={step === "code" ? "Verify code" : "Send code"}
      className="size-10 shrink-0 rounded-full border-none!"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <ArrowRight className="size-4" />
      )}
    </Button>
  );

  if (step === "code") {
    return (
      <form onSubmit={onVerifySubmit} className="flex w-full flex-col gap-2">
        <div className="flex items-center gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            autoFocus
            className="h-10 flex-1 rounded-full border-ink/40 px-4 text-center tracking-[0.3em]"
          />
          <SendButton disabled={pending || code.trim().length === 0} />
        </div>
        <p className="text-xs text-ink-muted">
          We sent a 6-digit code to {email}.
        </p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => void sendCode()}
            className="text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
          >
            Resend code
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Use a different email
          </button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </form>
    );
  }

  return (
    <form onSubmit={onSendSubmit} className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          className="h-10 flex-1 rounded-full border-ink/40 px-4"
        />
        <SendButton disabled={pending || email.trim().length === 0} />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
