import { Button, Input } from "@houston-ai/core";
import { ArrowRight, Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { sendEmailOtp, verifyEmailOtp } from "../../lib/auth";
import { logger } from "../../lib/logger";
import { authErrorKey } from "./auth-errors";
import { EmailCodeEntry } from "./email-code-entry";
import { EmailCodeFooter } from "./email-code-footer";

type Step = "email" | "code";

/**
 * Passwordless email sign-in: enter an address, receive a 6-digit code, type
 * it back. Stays entirely in the app (no browser, no redirect) — the desktop
 * counterpart to the loopback OAuth flow. On success the parent SignInScreen
 * unmounts as soon as the session lands in the query cache.
 *
 * Compact inline shape: a rounded email field with a send button on its right.
 * The code step swaps it for the six-box {@link EmailCodeEntry}.
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

  if (step === "code") {
    return (
      <form onSubmit={onVerifySubmit} className="flex w-full flex-col gap-2">
        <EmailCodeEntry
          code={code}
          onChange={setCode}
          onComplete={(value) => void verifyCode(value)}
          pending={pending}
          filled={submitFilled}
          label={tAuth("email.verifyCode")}
        />
        <EmailCodeFooter
          email={email}
          pending={pending}
          error={error}
          onResend={() => void sendCode()}
          backLabel={tAuth("email.useDifferentEmail")}
          onBack={() => {
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
          className="h-11 flex-1 rounded-full border-ink/40 px-4 md:h-10"
        />
        <Button
          type="submit"
          size="icon"
          variant={submitFilled ? "default" : "secondary"}
          disabled={pending || email.trim().length === 0}
          aria-label={tAuth("email.sendCode")}
          // The address row is the phone's primary sign-in field: 44px there,
          // 40px from md:.
          className="size-11 shrink-0 rounded-full border-none! active:scale-[0.96] md:size-10 md:active:scale-100"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowRight className="size-4" />
          )}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
