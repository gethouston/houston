import { cn } from "@houston-ai/core";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * App-local layout primitives shared by the four top-level surfaces (AI hub,
 * Integrations, Organization, Settings) so their width and header spacing stay
 * identical. Deliberately NOT in `ui/` — these encode Houston page chrome, not a
 * reusable widget, so they carry no inventory/parity churn. Props-only, no store
 * imports. The canon is the AI hub's structure: a centered `max-w-5xl px-8`
 * column with a 28px normal-weight title. See knowledge-base/design-system.md.
 */

/**
 * The canonical horizontal container for a top-level surface: centered, capped
 * at `max-w-5xl`, `px-8` gutters. The single source of the shared page width.
 * Vertical padding is the caller's (top surfaces open at `pt-10`, close at
 * `pb-10`; the fixed-masthead surfaces split that across two containers). Extra
 * div props pass through so it can also be the ARIA `tabpanel` of a surface.
 */
export function PageContainer({
  children,
  className,
  ...rest
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("mx-auto w-full max-w-5xl px-8", className)} {...rest}>
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  /** Optional muted one-line subtitle under the title. */
  subtitle?: string;
  /** Optional right-aligned slot (e.g. a primary action), vertically top-aligned. */
  trailing?: ReactNode;
  /** Extra classes, typically the bottom gap to the content (e.g. `mb-6`). */
  className?: string;
}

/**
 * The canonical page header for a top-level surface: a 28px normal-weight title
 * with an optional muted subtitle and an optional trailing slot. Guarantees the
 * four surfaces open with identical title typography and spacing.
 */
export function PageHeader({
  title,
  subtitle,
  trailing,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-[28px] font-normal text-ink">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </header>
  );
}
