import { cn } from "@houston-ai/core";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export function PageContainer({
  children,
  className,
  width = "default",
  ...rest
}: ComponentPropsWithoutRef<"div"> & { width?: "default" | "wide" }) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 md:px-8",
        width === "wide" ? "max-w-6xl" : "max-w-4xl",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

interface PageHeroProps {
  title: ReactNode;
  subtitle?: string;
  trailing?: ReactNode;
  className?: string;
  level?: 1 | 2;
  titleId?: string;
}

export function PageHero({
  title,
  subtitle,
  trailing,
  className,
  level = 1,
  titleId,
}: PageHeroProps) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <Heading id={titleId} className="text-2xl font-normal text-ink">
          {title}
        </Heading>
        {subtitle ? (
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </header>
  );
}
