import { useState, type FormEvent } from "react";
import { Button, Input } from "@houston-ai/core";
import { sendEmailOtp, verifyEmailOtp } from "../../lib/auth";
import { logger } from "../../lib/logger";
import { prettifyAuthError } from "./auth-errors";

type Step = "email" | "code";

/**
 * Passwordless email sign-in: enter an address, receive a 6-digit code, type
 * it back. Stays entirely in the app (no browser, no redirect) — the desktop
 * counterpart to the loopback OAuth flow. On success the parent SignInScreen
 * unmounts as soon as the session lands in the query cache.
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
      setError(prettifyAuthError(err instanceof Error ? err.message : String(err)));
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
      setError(prettifyAuthError(err instanceof Error ? err.message : String(err)));
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
      <form onSubmit={onVerifySubmit} className="flex w-full flex-col gap-2">
        <p className="text-center text-xs text-muted-foreground">
          We sent a 6-digit code to {email}. Enter it below.
        </p>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          autoFocus
          className="h-11 text-center tracking-[0.4em]"
        />
        <Button
          type="submit"
          disabled={pending || code.trim().length === 0}
          className="h-11 w-full rounded-full"
        >
          {pending ? "Verifying..." : "Verify code"}
        </Button>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="underline-offset-2 hover:underline"
          >
            Use a different email
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void sendCode()}
            className="underline-offset-2 hover:underline disabled:opacity-50"
          >
            Resend code
          </button>
        </div>
        {error && <p className="text-center text-xs text-destructive">{error}</p>}
      </form>
    );
  }

  return (
    <form onSubmit={onSendSubmit} className="flex w-full flex-col gap-2">
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        placeholder="you@example.com"
        className="h-11"
      />
      <Button
        type="submit"
        variant="outline"
        disabled={pending || email.trim().length === 0}
        className="h-11 w-full rounded-full"
      >
        {pending ? "Sending..." : "Continue with email"}
      </Button>
      {error && <p className="text-center text-xs text-destructive">{error}</p>}
    </form>
  );
}
