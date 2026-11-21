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

  const sentToken = useRef<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: autoSubmit.token is the intentional trigger; sendCode/setEmail are stable enough and re-running on their identity would resend the code.
  useEffect(() => {
    if (!autoSubmit || autoSubmit.token === sentToken.current) return;
    sentToken.current = autoSubmit.token;
    setEmail(autoSubmit.email);
    void sendCode(autoSubmit.email);
  }, [autoSubmit]);

  const verifyCode = async (value: string = code) => {
    const trimmedCode = value.trim();
    if (!trimmedCode) return;
    setPending(true);
    setError(null);
    try {
      await verifyEmailOtp(email.trim(), trimmedCode);
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
