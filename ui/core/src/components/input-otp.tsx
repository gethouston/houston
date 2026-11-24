"use client";

import { OTPInput, OTPInputContext, REGEXP_ONLY_DIGITS } from "input-otp";
import * as React from "react";

import { cn } from "../utils";

/**
 * One-time-code entry: one box per character, auto-advance, backspace
 * navigation, and paste distribution (via the `input-otp` primitive). Slots
 * are separate rounded boxes (`gap-2` on the group) rather than a joined
 * segmented field. The active slot signals with `border-focus`, matching how
 * every other field in the design system marks focus.
 */
function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string;
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        "flex items-center gap-2 has-disabled:opacity-50",
        containerClassName,
      )}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  );
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  index: number;
}) {
  const inputOTPContext = React.useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {};

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "relative flex size-9 items-center justify-center rounded-lg border border-line-input bg-transparent text-base text-ink transition-colors duration-200 outline-none dark:bg-line-input/30",
        "data-[active=true]:z-10 data-[active=true]:border-focus",
        "aria-invalid:border-danger",
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-ink" />
        </div>
      )}
    </div>
  );
}

export { InputOTP, InputOTPGroup, InputOTPSlot, REGEXP_ONLY_DIGITS };
