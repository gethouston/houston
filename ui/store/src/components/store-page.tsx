import { cn } from "@houston-ai/core";
import type * as React from "react";

import { storeLayout, storeType } from "../primitives";

/**
 * The frame every Agent Store screen sits in: the page plane, the centred
 * 1040px measure, the 24/32px gutters, 48px of air on top and the 40/64px
 * rhythm between the blocks it holds.
 *
 * Children are laid out as a vertical stack, so a screen is written as a
 * `StorePageHeader` followed by `StoreSection`s with no spacing of their own.
 * Presentational and stateless: pass data in, get layout out.
 */
function StorePage({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="store-page"
      className={cn(storeLayout.page, className)}
      {...props}
    >
      <div
        className={cn(
          storeLayout.container,
          storeLayout.pagePadding,
          storeLayout.stack,
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface StorePageHeaderProps
  extends Omit<React.ComponentProps<"header">, "title"> {
  /** The page title, set in the display role (32px/1.2 semibold). */
  title: React.ReactNode;
  /** One line of context under the title, in the muted meta role. */
  subtitle?: React.ReactNode;
  /** Right-aligned actions. At most one of them wears the accent. */
  actions?: React.ReactNode;
}

/**
 * A store page's masthead: the display title, an optional meta subtitle and an
 * optional right-aligned `actions` slot. Wraps the actions under the title on
 * narrow viewports rather than squeezing either side.
 */
function StorePageHeader({
  className,
  title,
  subtitle,
  actions,
  ...props
}: StorePageHeaderProps) {
  return (
    <header
      data-slot="store-page-header"
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-6 gap-y-4",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className={storeType.display}>{title}</h1>
        {subtitle ? <p className={storeType.meta}>{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

interface StoreSectionProps
  extends Omit<React.ComponentProps<"section">, "title"> {
  /** The section title, set in the section role (20px/1.3 semibold). */
  title?: React.ReactNode;
  /** One line under the title, in the muted meta role. */
  description?: React.ReactNode;
  /** Right-aligned section actions ("See all", a filter, a sort). */
  actions?: React.ReactNode;
}

/**
 * One block of a store page: an optional titled head and its body, separated
 * by 24px.
 *
 * The section carries no outer margin on purpose. The 40/64px rhythm between
 * blocks is a flex gap owned by `StorePage` (`storeLayout.stack`), so sections
 * never collapse into one another and drop into any parent unchanged.
 */
function StoreSection({
  className,
  title,
  description,
  actions,
  children,
  ...props
}: StoreSectionProps) {
  const hasHead = Boolean(title || description || actions);
  return (
    <section
      data-slot="store-section"
      className={cn(storeLayout.sectionStack, className)}
      {...props}
    >
      {hasHead ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div className="flex min-w-0 flex-col gap-1">
            {title ? <h2 className={storeType.sectionTitle}>{title}</h2> : null}
            {description ? (
              <p className={storeType.meta}>{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export type { StorePageHeaderProps, StoreSectionProps };
export { StorePage, StorePageHeader, StoreSection };
