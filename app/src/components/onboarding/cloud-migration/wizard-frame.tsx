import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";

export function WizardFrame({
  mark,
  badge,
  eyebrow,
  title,
  body,
  children,
  footer,
  wide,
}: {
  mark?: ReactNode;
  badge?: ReactNode;
  eyebrow?: string;
  title: string;
  body?: string;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10 text-ink">
      <div
        className={cn(
          "relative z-10 flex min-h-0 w-full flex-col items-center gap-6 text-center",
          wide ? "max-w-[820px]" : "max-w-xl",
        )}
      >
        {mark}
        {badge}
        <div>
          {eyebrow && (
            <p className="mb-2 text-xs font-medium text-ink-muted">{eyebrow}</p>
          )}
          <h1 className="text-balance text-[34px] font-semibold leading-tight tracking-tight">
            {title}
          </h1>
        </div>
        {body && (
          <p className="max-w-lg text-pretty text-base leading-relaxed text-ink-muted">
            {body}
          </p>
        )}
        {children && (
          <div className="min-h-0 w-full flex-1 overflow-y-auto">
            {children}
          </div>
        )}
        {footer && (
          <div className="flex w-full flex-col items-center gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
