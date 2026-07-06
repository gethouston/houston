import { Button, Input } from "@houston-ai/core";
import { type FormEvent, useState } from "react";
import { sendEmailOtp, verifyEmailOtp } from "../../lib/auth";
import { logger } from "../../lib/logger";
import { prettifyAuthError } from "./auth-errors";

type Step = "email" | "code";

const LABEL = "text-sm font-medium text-foreground";
const FIELD = "h-10 rounded-lg bg-muted/40";

/**
 * Passwordless email sign-in: enter an address, receive a 6-digit code, type
 * it back. Stays entirely in the app (no browser, no redirect) — the desktop
 * counterpart to the loopback OAuth flow. On success the parent SignInScreen
 * unmounts as soon as the session lands in the query cache.
 *
 * The primary section of the sign-in card: a labelled field + one compact
 * primary button, so it reads as a structured credential form (the OAuth
 * providers sit below the divider as the secondary path).
 */
export function EmailSignIn() {
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
      setError(
        prettifyAuthError(err instanceof Error ? err.message : String(err)),
      );
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
      setError(
        prettifyAuthError(err instanceof Error ? err.message : String(err)),
      );
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

  if (step === "code") {
    return (
      <form onSubmit={onVerifySubmit} className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="signin-code" className={LABEL}>
            Verification code
          </label>
          <Input
            id="signin-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            autoFocus
            className={`${FIELD} tracking-[0.3em]`}
          />
          <p className="text-xs text-muted-foreground">
            We sent a 6-digit code to {email}.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            type="submit"
            disabled={pending || code.trim().length === 0}
            className="h-10 rounded-full px-6"
          >
            {pending ? "Verifying..." : "Verify code"}
          </Button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void sendCode()}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
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
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Use a different email
          </button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
    );
  }

  return (
    <form onSubmit={onSendSubmit} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signin-email" className={LABEL}>
          Email
        </label>
        <Input
          id="signin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          className={FIELD}
        />
      </div>
      <Button
        type="submit"
        disabled={pending || email.trim().length === 0}
        className="h-10 self-start rounded-full px-6"
      >
        {pending ? "Sending..." : "Continue"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
