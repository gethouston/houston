import { Button } from "@houston-ai/core";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

interface SetupCardProps {
  icon?: ReactNode;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  helper?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
}

export function SetupCard({
  icon,
  eyebrow,
  title,
  subtitle,
  children,
  helper,
  onBack,
  backLabel,
  onNext,
  nextLabel,
  nextDisabled,
  nextLoading,
}: SetupCardProps) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden pt-safe pb-safe md:px-6">
      <div
        key={title}
        className="setup-step-in relative z-10 flex min-h-0 w-full flex-1 flex-col bg-card p-5 text-ink md:h-[680px] md:max-h-[88dvh] md:max-w-2xl md:flex-initial md:rounded-2xl md:border md:border-line md:p-8 md:shadow-raised"
      >
        {icon && <div className="mb-4">{icon}</div>}
        {eyebrow && (
          <p className="text-xs font-medium text-ink-muted">{eyebrow}</p>
        )}
        {title && (
          <h1 className="mt-1 text-[22px] font-semibold leading-tight">
            {title}
          </h1>
        )}
        {subtitle && <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>}

        <div className="mt-6 flex min-h-0 flex-1 flex-col">{children}</div>

        {(onBack || onNext || helper) && (
          <div className="mt-6 flex flex-col-reverse gap-3 md:mt-8 md:flex-row md:items-center md:justify-between md:gap-4">
            <div className="shrink-0">
              {onBack && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full rounded-full md:w-auto"
                  onClick={onBack}
                >
                  <ArrowLeft className="size-4" />
                  {backLabel}
                </Button>
              )}
            </div>
            {helper && (
              <p className="text-center text-xs text-ink-muted md:flex-1 md:text-right">
                {helper}
              </p>
            )}
            <div className="shrink-0">
              {onNext && (
                <Button
                  type="button"
                  className="w-full rounded-full md:w-auto"
                  onClick={onNext}
                  disabled={nextDisabled || nextLoading}
                >
                  {nextLoading && <Loader2 className="size-4 animate-spin" />}
                  {nextLabel}
                  {!nextLoading && <ArrowRight className="size-4" />}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
