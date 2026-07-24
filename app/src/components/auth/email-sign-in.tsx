import {
  Button,
  Input,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  REGEXP_ONLY_DIGITS,
} from "@houston-ai/core";
import { ArrowRight, Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { sendEmailOtp, verifyEmailOtp } from "../../lib/auth";
import { logger } from "../../lib/logger";
import { authErrorKey } from "./auth-errors";
import { EmailCodeFooter } from "./email-code-footer";

type Step = "email" | "code";

/**
 * Passwordless email sign-in: enter an address, receive a 6-digit code, type
 * it back. Stays entirely in the app (no browser, no redirect) — the desktop
 * counterpart to the loopback OAuth flow. On success the parent SignInScreen
 * unmounts as soon as the session lands in the query cache.
 *
 * Compact inline shape: a rounded email field with a send button on its right.
 * The code step swaps it for a six-box pin input that auto-advances, accepts a
 * pasted code, and verifies itself on the sixth digit; the arrow button stays
 * as the retry affordance after a rejected code.
 *
 * `submitFilled` controls whether the send/verify button is the screen's single
 * filled action: it is by default, but steps down to secondary when the returning
 * user's {@link ContinueLastSignIn} button is showing and owns the filled slot.
 *
 * `autoSubmit` lets the "Continue with your email" button drive this form: a new
 * token prefills the stored address and fires the code send in one click, so the
 * returning user lands straight on the 6-digit entry.
 */
export function EmailSignIn({
  submitFilled = true,
  autoSubmit,
}: {
  submitFilled?: boolean;
  autoSubmit?: { email: string; token: number };
}) {
  const { t } = useTranslation("errors");
  const { t: tAuth } = useTranslation("auth");
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Takes the value explicitly so the "Continue with your email" auto-submit can
  // send the just-prefilled address without racing the `email` state update.
  const sendCode = async (value: string = email) => {
    const trimmed = value.trim();
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

  // One-click return path: when the continue button hands over a fresh token,
  // prefill the stored address and send the code immediately. The ref guards
  // against re-firing on unrelated re-renders (a given token sends exactly once).
  const sentToken = useRef<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: autoSubmit.token is the intentional trigger; sendCode/setEmail are stable enough and re-running on their identity would resend the code.
  useEffect(() => {
    if (!autoSubmit || autoSubmit.token === sentToken.current) return;
    sentToken.current = autoSubmit.token;
    setEmail(autoSubmit.email);
    void sendCode(autoSubmit.email);
  }, [autoSubmit]);

  // Takes the value explicitly so the pin input's `onComplete` can submit the
  // just-completed code without racing the `code` state update.
  const verifyCode = async (value: string = code) => {
    const trimmedCode = value.trim();
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
      variant={submitFilled ? "default" : "secondary"}
      disabled={disabled}
      aria-label={
        step === "code" ? tAuth("email.verifyCode") : tAuth("email.sendCode")
      }
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
          <InputOTP
            maxLength={6}
            value={code}
            onChange={setCode}
            onComplete={(value: string) => void verifyCode(value)}
            pattern={REGEXP_ONLY_DIGITS}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            disabled={pending}
            containerClassName="flex-1 justify-center"
          >
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <InputOTPSlot
                  key={index}
                  index={index}
                  className="size-10 border-ink/40"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <SendButton disabled={pending || code.trim().length < 6} />
        </div>
        <EmailCodeFooter
          email={email}
          pending={pending}
          error={error}
          onResend={() => void sendCode()}
          onChangeEmail={() => {
            setStep("email");
            setCode("");
            setError(null);
          }}
        />
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
