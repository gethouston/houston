import { Button, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { HoustonLogo } from "../shell/experience-card";

interface MissionDoneScreenProps {
  /** Houston brand label in the header (the small text next to the logo). */
  brandLabel: string;
  /** Optional caption shown UNDER the avatar (e.g. assistant name). */
  assistantName?: string;
  /** Color slug forwarded to `HoustonAvatar`. */
  assistantColor: string;
  /** Big celebratory headline. */
  title: string;
  /** One-line subtitle under the title. Omit for none. */
  subtitle?: string;
  /** The body of the screen — usually a card showing what was just created. */
  children: ReactNode;
  /** Primary CTA label. */
  continueLabel: string;
  onContinue: () => void;
  /** Optional always-visible skip link next to the CTA. */
  skipLabel?: string;
  onSkip?: () => void;
}

/**
 * Shared full-page "you just did something" screen used at the end of the
 * Try, Skill, and Routine missions, plus the final Summary. Same shell as
 * the original `TryDoneScreen` (and replaces it), generalized so each
 * mission can render its own celebration content in `children` without
 * recreating the chrome.
 *
 * Layout: shrink-0 brand header, growing centered main with the avatar +
 * title + subtitle and the slot for `children`, shrink-0 footer with the
 * Continue button (and optional Skip link). Background and typography
 * mirror the existing celebratory screen so transitioning between
 * Try → Skill → Routine → Summary feels like one consistent moment of
 * the same flow.
 */
export function MissionDoneScreen({
  brandLabel,
  assistantName,
  assistantColor,
  title,
  subtitle,
  children,
  continueLabel,
  onContinue,
  skipLabel,
  onSkip,
}: MissionDoneScreenProps) {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="shrink-0 bg-background/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <HoustonLogo size={24} />
          <span className="text-sm font-medium">{brandLabel}</span>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <HoustonAvatar
              color={resolveAgentColor(assistantColor)}
              diameter={56}
              running
            />
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-[28px] font-normal leading-tight">{title}</h1>
              {subtitle && (
                <p className="max-w-md text-sm text-muted-foreground">
                  {subtitle}
                </p>
              )}
              {assistantName && (
                <p className="text-xs text-muted-foreground">{assistantName}</p>
              )}
            </div>
          </div>
          {children}
        </div>
      </main>
      <footer className="shrink-0 border-t border-black/5 bg-background/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-center gap-6">
          <Button className="rounded-full px-6" onClick={onContinue}>
            {continueLabel}
            <ArrowRight className="ml-1 size-4" />
          </Button>
          {skipLabel && onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {skipLabel}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
