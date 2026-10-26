import {
  Button,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  REGEXP_ONLY_DIGITS,
} from "@houston-ai/core";
import { ArrowRight, Loader2 } from "lucide-react";

/**
 * The six-box code row: a pin input that auto-advances, accepts a pasted
 * code, and submits itself on the sixth digit, with the arrow button as the
 * retry affordance after a rejected code. The parent `<form>` owns submit.
 */
export function EmailCodeEntry({
  code,
  onChange,
  onComplete,
  pending,
  filled,
  label,
}: {
  code: string;
  onChange: (code: string) => void;
  onComplete: (code: string) => void;
  pending: boolean;
  /** Whether the arrow is the screen's single filled action. */
  filled: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <InputOTP
        maxLength={6}
        value={code}
        onChange={onChange}
        onComplete={onComplete}
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
              className="size-9 border-ink/40 md:size-10"
            />
          ))}
        </InputOTPGroup>
      </InputOTP>
      <Button
        type="submit"
        size="icon"
        variant={filled ? "default" : "secondary"}
        disabled={pending || code.trim().length < 6}
        aria-label={label}
        className="size-10 shrink-0 rounded-full border-none! active:scale-[0.96] md:active:scale-100"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ArrowRight className="size-4" />
        )}
      </Button>
    </div>
  );
}
