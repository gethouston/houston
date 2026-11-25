import { Dialog, DialogCloseButton, DialogContent } from "@houston-ai/core";
import { duration, easing, space } from "@houston/design-tokens";
import { type CSSProperties, type ReactNode, useState } from "react";
import { createUserDismissal } from "./user-dismissal";
import "./plan-announcement.css";
import "./plan-briefing-motion.css";

const briefingStyle = (width: string) =>
  ({
    "--briefing-width": width,
    "--briefing-space-2": space["2"],
    "--briefing-space-4": space["4"],
    "--briefing-space-6": space["6"],
    "--briefing-space-8": space["8"],
    "--briefing-space-16": space["16"],
    "--briefing-space-32": space["32"],
    "--briefing-duration": duration.fast,
    "--briefing-press": duration.press,
    "--briefing-easing": `cubic-bezier(${easing.entrance.join(", ")})`,
  }) as CSSProperties;

/**
 * The frame every plan announcement wears: a dark briefing centered on the
 * desktop, a full-height sheet on phones. Only the person closes it (see
 * {@link createUserDismissal}); the X, Escape and a click outside all call
 * `onDismiss`.
 */
export function PlanBriefingFrame({
  open,
  onDismiss,
  closeLabel,
  width,
  described = true,
  onCloseAutoFocus,
  testId,
  children,
}: {
  open: boolean;
  onDismiss: () => void;
  closeLabel: string;
  /** A `layout` token: the frame's desktop width. */
  width: string;
  /** False when the content carries no DialogDescription. */
  described?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
  testId?: string;
  children: ReactNode;
}) {
  const [dismissal] = useState(createUserDismissal);
  return (
    <Dialog open={open} onOpenChange={dismissal.onOpenChange(onDismiss)}>
      <DialogContent
        {...dismissal.contentProps}
        {...(described ? {} : { "aria-describedby": undefined })}
        data-theme="dark"
        data-testid={testId}
        style={briefingStyle(width)}
        showCloseButton={false}
        onCloseAutoFocus={onCloseAutoFocus}
        className="plan-briefing-frame h-dvh overflow-hidden bg-dialog p-0 text-ink motion-reduce:animate-none sm:max-w-[min(var(--briefing-width),calc(100%-var(--briefing-space-32)))] md:h-auto md:max-h-[calc(100dvh-var(--briefing-space-32))]"
      >
        <div className="plan-briefing-stage relative flex min-h-0">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+var(--briefing-space-32))] pt-[calc(env(safe-area-inset-top)+var(--briefing-space-32))] md:px-8 md:pb-8 md:pt-8">
            {children}
          </div>
        </div>
        <DialogCloseButton
          label={closeLabel}
          className="absolute right-4 top-[calc(env(safe-area-inset-top)+var(--briefing-space-16))] md:top-4"
        />
      </DialogContent>
    </Dialog>
  );
}
